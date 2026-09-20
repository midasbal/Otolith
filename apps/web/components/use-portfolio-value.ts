"use client";

import { useCallback, useEffect, useState } from "react";
import { getPortfolioValuation, type PortfolioValuation } from "@/lib/stellar";

type ValuationState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: PortfolioValuation };

export type PortfolioValuationInput = {
  oracle: string;
  sellAsset: { contract: string; symbol: string; balance: string };
  buyAsset: { contract: string; symbol: string; balance: string };
  targetBuyWeightBps: number;
  bandThresholdBps: number;
};

type Loaded = { key: string; state: ValuationState };

/**
 * Loads live drift and total USD value for an installed policy. Takes
 * the policy's own params (from usePolicyStatus) and the account's
 * current balances for the same two assets (from
 * useSmartAccountBalances) as input, rather than reading either again:
 * this hook only adds the two oracle price reads plus one decimals read
 * on top of what the dashboard already has loaded.
 *
 * Passing null (no installed policy yet, or balances not loaded yet)
 * returns an idle state rather than fetching. Same pattern as the other
 * read-layer hooks: the input is compared by value (serialized), not by
 * object identity, and the effect only ever reconstructs its argument
 * from that serialized key, never the raw object from render scope, so a
 * freshly recomputed but equal input does not needlessly refetch.
 */
export function usePortfolioValuation(input: PortfolioValuationInput | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);
  const key = input ? JSON.stringify(input) : null;

  useEffect(() => {
    if (!key) {
      return;
    }

    let cancelled = false;

    getPortfolioValuation(JSON.parse(key) as PortfolioValuationInput)
      .then((result) => {
        if (!cancelled) {
          setLoaded({ key, state: { status: "loaded", result } });
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setLoaded({
            key,
            state: { status: "error", message: "Could not compute the portfolio's live value right now." },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key, reloadIndex]);

  const retry = useCallback(() => {
    setReloadIndex((n) => n + 1);
  }, []);

  if (!key) {
    return { state: { status: "idle" } as const, retry };
  }

  if (loaded && loaded.key === key) {
    return { state: loaded.state, retry };
  }

  return { state: { status: "loading" } as const, retry };
}
