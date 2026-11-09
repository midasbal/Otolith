import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/*
  A per-client-IP rate limit on the endpoints that spend the deployer's
  fees or make heavy RPC calls for any caller, on Upstash Redis over its
  REST client with a sliding window.

  It fails open. With the credentials missing, or Upstash slow, down or
  erroring, the request is allowed: this limit is one layer of several (the
  allowlist and the fee budget are the others), and a fault in a service
  this app does not run must never be able to stop account creation or
  rebalancing.

  The client IP is the first address in X-Forwarded-For (or X-Real-IP),
  which the host's proxy sets; it is only as trustworthy as that proxy.
  With no address at all the request is allowed rather than pooled with
  every other such request.
*/

type Policy = {
  /** Keeps each endpoint's counts apart. */
  name: string;
  requests: number;
  window: `${number} ${"s" | "m"}`;
};

/**
 * Account creation is two deployer requests (deploy and fund), and install
 * and revoke one each, so a full session is about six. Ten in ten minutes
 * leaves room for a retry or two and for several people behind one address.
 */
export const DEPLOYER_LIMIT: Policy = { name: "deployer", requests: 10, window: "10 m" };

/** A rebalance is one request; a few a minute covers a retry. */
export const REBALANCE_SUBMIT_LIMIT: Policy = { name: "rebalance-submit", requests: 5, window: "1 m" };

/**
 * The check is read when a dashboard opens, every 15 seconds while it
 * stays stale, and while a reconcile runs after a transaction (one read at
 * a time, each taking seconds). Thirty a minute is well above that.
 */
export const REBALANCE_CHECK_LIMIT: Policy = { name: "rebalance-check", requests: 30, window: "1 m" };

// Give up on Upstash after this long and allow the request.
const UPSTASH_TIMEOUT_MS = 1500;

let redis: Redis | null | undefined;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redis === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = url && token ? new Redis({ url, token }) : null;
  }
  return redis;
}

function getLimiter(policy: Policy): Ratelimit | null {
  const client = getRedis();
  if (!client) {
    return null;
  }
  let limiter = limiters.get(policy.name);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(policy.requests, policy.window),
      prefix: `otolith:${policy.name}`,
      timeout: UPSTASH_TIMEOUT_MS,
      analytics: false,
    });
    limiters.set(policy.name, limiter);
  }
  return limiter;
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Counts this request against the client's allowance. Never throws. */
export async function checkRateLimit(request: Request, policy: Policy): Promise<RateLimitVerdict> {
  try {
    const limiter = getLimiter(policy);
    const ip = clientIp(request);
    if (!limiter || !ip) {
      return { allowed: true };
    }
    const result = await limiter.limit(ip);
    // A timeout comes back as a success with a reason, which is the open
    // failure wanted here.
    if (result.success) {
      return { allowed: true };
    }
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
  } catch (err) {
    console.warn(JSON.stringify({ tag: "rate-limit", event: "unavailable", limit: policy.name, error: err instanceof Error ? err.message : "unknown" }));
    return { allowed: true };
  }
}
