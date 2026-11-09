import "server-only";

import { NextResponse } from "next/server";
import { checkRebalance, triggerRebalance, DeployerNotConfiguredError, FeeBudgetExhaustedError } from "@/lib/server/rebalance";
import { checkRateLimit, REBALANCE_CHECK_LIMIT, REBALANCE_SUBMIT_LIMIT } from "@/lib/server/rate-limit";
import { readJsonBody, REBALANCE_MAX_BODY_BYTES } from "@/lib/server/request-limits";

function isValidAccountAddress(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("C") && value.length === 56;
}

/**
 * Checks whether a rebalance is currently due for a smart account.
 * Read-only: never submits anything, so it needs no deployer key at
 * all, only the account address.
 */
export async function GET(request: Request) {
  const limit = await checkRateLimit(request, REBALANCE_CHECK_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { state: "error", message: "Too many requests. Try again in a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const account = new URL(request.url).searchParams.get("account");
  if (!isValidAccountAddress(account)) {
    return NextResponse.json({ state: "error", message: "Expected an account query parameter (a C... address)." }, { status: 400 });
  }

  try {
    const state = await checkRebalance(account);
    return NextResponse.json(state);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { state: "error", message: "Could not reach the Stellar network to check this account." },
      { status: 502 },
    );
  }
}

/**
 * Triggers a real permissionless rebalance, submitted and fee-paid by
 * our own deployer/keeper key. Re-checks eligibility first and never
 * submits a transaction that is not ready.
 */
export async function POST(request: Request) {
  const limit = await checkRateLimit(request, REBALANCE_SUBMIT_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { state: "error", message: "Too many requests. Try again in a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const read = await readJsonBody(request, REBALANCE_MAX_BODY_BYTES);
  if (!read.ok) {
    return read.reason === "too-large"
      ? NextResponse.json({ state: "error", message: "Request body too large." }, { status: 413 })
      : NextResponse.json({ state: "error", message: "Invalid request body." }, { status: 400 });
  }
  const body = read.json;

  const account = typeof body === "object" && body !== null ? (body as { account?: unknown }).account : undefined;
  if (!isValidAccountAddress(account)) {
    return NextResponse.json({ state: "error", message: "Expected an account field (a C... address)." }, { status: 400 });
  }

  try {
    const result = await triggerRebalance(account);
    if ("submitted" in result) {
      return NextResponse.json({ success: true, hash: result.hash, ledger: result.ledger });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DeployerNotConfiguredError || err instanceof FeeBudgetExhaustedError) {
      return NextResponse.json({ state: "error", message: err.message }, { status: 503 });
    }
    console.error(err);
    return NextResponse.json(
      { state: "error", message: "Could not reach the Stellar network to submit this rebalance." },
      { status: 502 },
    );
  }
}
