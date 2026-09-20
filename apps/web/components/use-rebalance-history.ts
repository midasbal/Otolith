"use client";

import { useCallback, useEffect, useState } from "react";
import { getRebalanceHistory, type RebalanceHistoryResult } from "@/lib/stellar";

type HistoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: RebalanceHistoryResult };

type Loaded = { address: string; state: HistoryState };

/**
 * Reads a smart account's recent rebalance history from the read
 * layer. Same "loading derived at render time" pattern as the other
 * read-layer hooks: the effect only ever calls setState from its own
 * async callbacks.
 */
export function useRebalanceHistory(address: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    if (!address) {
      return;
    }

    let cancelled = false;

    getRebalanceHistory(address)
      .then((result) => {
        if (!cancelled) {
          setLoaded({ address, state: { status: "loaded", result } });
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setLoaded({
            address,
            state: {
              status: "error",
              message: "Could not reach the Stellar network to read this account's activity.",
            },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, reloadIndex]);

  const retry = useCallback(() => {
    setReloadIndex((n) => n + 1);
  }, []);

  if (!address) {
    return { state: { status: "idle" } as const, retry };
  }

  if (loaded && loaded.address === address) {
    return { state: loaded.state, retry };
  }

  return { state: { status: "loading" } as const, retry };
}
