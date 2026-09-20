"use client";

import { useCallback, useEffect, useState } from "react";

export type RebalanceCheckResult =
  | { state: "no_policy" }
  | { state: "not_due"; reason: string }
  | { state: "ready"; contextRuleId: number; amountIn: string; amountOut: string }
  | { state: "cooldown" }
  | { state: "pool_blocked" }
  | { state: "error"; message: string };

type CheckState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: RebalanceCheckResult };

type Loaded = { address: string; state: CheckState };

/**
 * Checks whether a rebalance is currently due for a smart account, via
 * the read-only /api/rebalance check. Same "loading derived at render
 * time" pattern as the other read-layer hooks (use-policy-status.ts,
 * use-smart-account-balances.ts).
 */
export function useRebalanceCheck(address: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    if (!address) {
      return;
    }

    let cancelled = false;

    fetch(`/api/rebalance?account=${encodeURIComponent(address)}`)
      .then((res) => res.json())
      .then((result: RebalanceCheckResult) => {
        if (!cancelled) {
          setLoaded({ address, state: { status: "loaded", result } });
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setLoaded({
            address,
            state: { status: "error", message: "Could not check whether a rebalance is due." },
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
