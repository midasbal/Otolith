"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBalancesGuarded } from "@/components/balances-floor";
import { queryKeys } from "@/components/query-keys";
import type { SmartAccountBalancesResult } from "@/lib/stellar";

type BalancesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: SmartAccountBalancesResult };

const IDLE: BalancesState = { status: "idle" };
const LOADING: BalancesState = { status: "loading" };
const ERROR: BalancesState = {
  status: "error",
  message: "Could not reach the Stellar network. Check your connection and try again.",
};

/**
 * Loads a smart account's balances for the product's fixed pair, with
 * loading and error states of its own. Passing `null` (not connected)
 * returns an idle state rather than fetching.
 *
 * Every read goes through fetchBalancesGuarded (balances-floor.ts), which
 * will not store a reading older than the last confirmed transaction.
 *
 * The read is a query keyed by the account, kept for the life of the
 * app: a page that opens finds the last reading at once, as "loaded",
 * and it is read again in the background if it is older than 15 seconds
 * (or when `retry` is called). Loading is only shown when there is no
 * reading yet, and a background read that fails keeps the last good one
 * on screen.
 */
export function useSmartAccountBalances(address: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.balances(address),
    queryFn: () => fetchBalancesGuarded(queryClient, address as string),
    enabled: address !== null,
    staleTime: 15_000,
  });

  const { data, isError, refetch } = query;

  const state = useMemo<BalancesState>(() => {
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
