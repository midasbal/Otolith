"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPolicyGuarded } from "@/components/account-ledger-floor";
import { queryKeys } from "@/components/query-keys";
import type { PolicyStatus } from "@/lib/stellar";

type PolicyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: PolicyStatus };

const IDLE: PolicyState = { status: "idle" };
const LOADING: PolicyState = { status: "loading" };
const ERROR: PolicyState = {
  status: "error",
  message: "Could not reach the Stellar network. Check your connection and try again.",
};

/**
 * Loads whether a rebalance policy is installed on a smart account,
 * with loading and error states of its own. Passing `null` (not
 * connected) returns an idle state rather than fetching.
 *
 * Every read goes through fetchPolicyGuarded (account-ledger-floor.ts), which
 * will not store a reading older than the last confirmed install or revoke.
 *
 * The read is a query keyed by the account, so the last reading is kept
 * while the app is open: a page that opens finds it at once, as
 * "loaded", while one background read runs to confirm it (the query is
 * always stale, so every mount reads again). Loading is only ever shown
 * when there is no reading yet, and a background read that fails keeps
 * the last good one on screen rather than replacing it with an error.
 */
export function usePolicyStatus(address: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.policy(address),
    queryFn: () => fetchPolicyGuarded(queryClient, address as string),
    enabled: address !== null,
    staleTime: 0,
  });

  const { data, isError, refetch } = query;

  const state = useMemo<PolicyState>(() => {
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
