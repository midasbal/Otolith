"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSmartAccountBalances, type ExtraTokenContract, type SmartAccountBalancesResult } from "@/lib/stellar";
import { BUY_ASSET } from "@/lib/stellar/policy-config";

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

// The tokens this product holds are fixed: the XLM/USDC pair (see
// policy-config.ts), with native XLM always read first by the read
// layer. So the list is a constant, not something derived from the
// policy once it loads: a list that changed when the policy arrived
// would change the query's key, and the balances would be read twice.
const PAIR_TOKENS: ExtraTokenContract[] = [{ contract: BUY_ASSET.contract, code: BUY_ASSET.symbol }];

/**
 * Loads a smart account's balances for the product's fixed pair, with
 * loading and error states of its own. Passing `null` (not connected)
 * returns an idle state rather than fetching.
 *
 * The read is a query keyed by the account, kept for the life of the
 * app: a page that opens finds the last reading at once, as "loaded",
 * and it is read again in the background if it is older than 15 seconds
 * (or when `retry` is called). Loading is only shown when there is no
 * reading yet, and a background read that fails keeps the last good one
 * on screen.
 */
export function useSmartAccountBalances(address: string | null) {
  const query = useQuery({
    queryKey: ["balances", address],
    queryFn: () => getSmartAccountBalances(address as string, PAIR_TOKENS),
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
