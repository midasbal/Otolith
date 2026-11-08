"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { computeValuation, getValuationPrices, type PortfolioValuation, type ValuationPrices } from "@/lib/stellar";

type ValuationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: PortfolioValuation };

export type PortfolioValuationInput = {
  oracle: string;
  /** `balance` is null until the account's balances have been read. */
  sellAsset: { contract: string; symbol: string; balance: string | null };
  buyAsset: { contract: string; symbol: string; balance: string | null };
  targetBuyWeightBps: number;
  bandThresholdBps: number;
};

const IDLE: ValuationState = { status: "idle" };
const LOADING: ValuationState = { status: "loading" };
const ERROR: ValuationState = { status: "error", message: "Could not compute the portfolio's live value right now." };

// How long a reading of the prices is trusted before a page that opens
// reads them again. A reading that found no price is never trusted: it
// is read again the next time anything asks.
const PRICES_FRESH_MS = 15_000;

/**
 * Loads live drift and total USD value for an installed policy. Takes
 * the policy's own params (from usePolicyStatus) and the account's
 * current balances for the same two assets (from
 * useSmartAccountBalances) as input.
 *
 * Two things make this up. The oracle prices are a query of their own,
 * keyed by the oracle and the two symbols, so they are kept between
 * pages and do not depend on the balances: they can be read as soon as
 * the policy is known, while the balances are still loading, and a
 * balance that changes does not read them again. The valuation itself is
 * then plain arithmetic over the cached prices and the current
 * balances, recomputed for free whenever either changes.
 *
 * Passing null (no installed policy yet) returns an idle state rather
 * than fetching. While the prices or the balances are still on their
 * way the state is loading.
 */
export function usePortfolioValuation(input: PortfolioValuationInput | null) {
  const query = useQuery({
    queryKey: ["prices", input?.oracle ?? null, input?.sellAsset.symbol ?? null, input?.buyAsset.symbol ?? null],
    queryFn: (): Promise<ValuationPrices> =>
      getValuationPrices(input!.oracle, input!.sellAsset.symbol, input!.buyAsset.symbol),
    enabled: input !== null,
    staleTime: (q) => (q.state.data?.kind === "ok" ? PRICES_FRESH_MS : 0),
  });

  const { data: prices, isError, refetch } = query;

  // The input is compared by value, not identity: the page rebuilds it
  // whenever the policy or balances change, and only a different value
  // should recompute anything.
  const key = input ? JSON.stringify(input) : null;

  const state = useMemo<ValuationState>(() => {
    if (!key) {
      return IDLE;
    }
    const current = JSON.parse(key) as PortfolioValuationInput;
    if (prices && current.sellAsset.balance !== null && current.buyAsset.balance !== null) {
      return {
        status: "loaded",
        result: computeValuation(
          {
            sellAsset: { ...current.sellAsset, balance: current.sellAsset.balance },
            buyAsset: { ...current.buyAsset, balance: current.buyAsset.balance },
            targetBuyWeightBps: current.targetBuyWeightBps,
            bandThresholdBps: current.bandThresholdBps,
          },
          prices,
        ),
      };
    }
    if (!prices && isError) {
      return ERROR;
    }
    return LOADING;
  }, [key, prices, isError]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { state, retry };
}
