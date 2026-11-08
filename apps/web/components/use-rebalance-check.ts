"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/components/query-keys";

export type RebalanceCheckResult =
  | { state: "no_policy" }
  | { state: "not_due"; reason: string }
  | { state: "ready"; contextRuleId: number; amountIn: string; amountOut: string }
  | { state: "cooldown" }
  | { state: "pool_blocked" }
  | { state: "error"; message: string };

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: RebalanceCheckResult };

const IDLE: CheckState = { status: "idle" };
const LOADING: CheckState = { status: "loading" };
const ERROR: CheckState = { status: "error", message: "Could not check whether a rebalance is due." };

// How long a reading is trusted before a page that opens reads it again.
// A reading the server itself reported as an error is never trusted.
const CHECK_FRESH_MS = 15_000;

// The route answers a failed check with an error state in its body, so the
// body is the result whatever the HTTP status: it is read and returned as
// it is, and only a request that fails outright counts as a failed read.
async function fetchRebalanceCheck(address: string): Promise<RebalanceCheckResult> {
  const res = await fetch(`/api/rebalance?account=${encodeURIComponent(address)}`);
  return (await res.json()) as RebalanceCheckResult;
}

/**
 * Checks whether a rebalance is currently due for a smart account, via
 * the read-only /api/rebalance check.
 *
 * The check is a query keyed by the account, kept for the life of the
 * app: a page that opens finds the last answer at once, as "loaded", and
 * it is read again in the background if it is older than 15 seconds, when
 * `retry` is called, or when an action that can change the answer
 * (installing or revoking a policy, a rebalance) invalidates it. Loading
 * is only shown when there is no answer yet, and a background read that
 * fails keeps the last good answer on screen.
 */
export function useRebalanceCheck(address: string | null) {
  const query = useQuery({
    queryKey: queryKeys.rebalanceCheck(address),
    queryFn: () => fetchRebalanceCheck(address as string),
    enabled: address !== null,
    staleTime: (q) => (q.state.data?.state === "error" ? 0 : CHECK_FRESH_MS),
  });

  const { data, isError, refetch } = query;

  const state = useMemo<CheckState>(() => {
    if (!address) {
      return IDLE;
    }
    if (data) {
      return { status: "loaded", result: data };
    }
    if (isError) {
      return ERROR;
    }
    return LOADING;
  }, [address, data, isError]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { state, retry };
}
