"use client";

import { useCallback, useEffect, useState } from "react";
import { getPolicyStatus, type PolicyStatus } from "@/lib/stellar";

type PolicyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: PolicyStatus };

type Loaded = { address: string; state: PolicyState };

/**
 * Loads whether a rebalance policy is installed on a smart account,
 * with loading and error states of its own. Passing `null` (not
 * connected) returns an idle state rather than fetching.
 *
 * Same pattern as the other read-layer hooks: "loading" is derived at
 * render time rather than set from inside the effect, so the effect
 * itself only ever calls setState from its async callbacks.
 */
export function usePolicyStatus(address: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    if (!address) {
      return;
    }

    let cancelled = false;

    getPolicyStatus(address)
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
              message: "Could not reach the Stellar network. Check your connection and try again.",
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
