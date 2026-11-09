"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/components/query-keys";
import { fetchRebalanceCheckGuarded } from "@/components/rebalance-check-floor";
import { readRebalanceCheck, type RebalanceCheckResult } from "@/components/rebalance-check-read";

export type { RebalanceCheckResult };

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

// One plain read of the check, with no floor. For a caller that has no
// ledger to hold it to (see use-trigger-rebalance.ts); the hook below reads
// through fetchRebalanceCheckGuarded.
export async function fetchRebalanceCheck(address: string): Promise<RebalanceCheckResult> {
  return (await readRebalanceCheck(address)).result;
}

/**
 * Checks whether a rebalance is currently due for a smart account, via
 * the read-only /api/rebalance check. Every read goes through
 * fetchRebalanceCheckGuarded (rebalance-check-floor.ts), which will not
 * store a check older than the last confirmed transaction.
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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.rebalanceCheck(address),
    queryFn: () => fetchRebalanceCheckGuarded(queryClient, address as string),
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
