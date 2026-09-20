"use client";

import { useEffect, useState } from "react";
import { getLivePrices, type LivePrice } from "@/lib/stellar";

// Reflector's own update resolution is roughly 300 seconds (see
// contracts/rebalancer/README.md). Polling faster than that would only
// ever re-read the same stored value, so this stays well above it while
// still refreshing often enough to feel live on screen.
const POLL_INTERVAL_MS = 45_000;

type LivePricesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; prices: LivePrice[]; updatedAt: number };

/**
 * Polls live USD prices for a fixed set of ticker symbols from one
 * oracle, on an interval cleaned up on unmount. Once a first read
 * succeeds, a later failed poll keeps showing the last good prices
 * instead of dropping back to an error screen: a single missed refresh
 * on a read-only display is not worth alarming over.
 */
export function useLivePrices(oracle: string, symbols: string[]): LivePricesState {
  const [state, setState] = useState<LivePricesState>({ status: "loading" });
  const symbolsKey = symbols.join(",");

  useEffect(() => {
    let cancelled = false;

    const fetchPrices = () => {
      getLivePrices(oracle, symbolsKey.split(","))
        .then((prices) => {
          if (!cancelled) {
            setState({ status: "loaded", prices, updatedAt: Date.now() });
          }
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) {
            setState((prev) =>
              prev.status === "loaded"
                ? prev
                : { status: "error", message: "Could not reach the price oracle." },
            );
          }
        });
    };

    fetchPrices();
    const id = window.setInterval(fetchPrices, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [oracle, symbolsKey]);

  return state;
}
