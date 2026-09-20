"use client";

import { useCallback, useEffect, useState } from "react";
import { getSmartAccountBalances, type ExtraTokenContract, type SmartAccountBalancesResult } from "@/lib/stellar";

type BalancesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: SmartAccountBalancesResult };

type Loaded = { address: string; extraKey: string; state: BalancesState };

const NO_EXTRA_TOKENS: ExtraTokenContract[] = [];

/**
 * Loads a smart account's balances from the read layer whenever the
 * address (or the extra token contracts to check alongside native XLM,
 * for example a policy's own sell_asset/buy_asset) changes, with loading
 * and error states of its own. Passing `null` (not connected) returns an
 * idle state rather than fetching.
 *
 * "Loading" is derived at render time (no fresh result yet for the
 * current address and extra-token set) rather than set from inside the
 * effect, so the effect itself only ever calls setState from its async
 * callbacks. The extra-token list is compared by value (serialized),
 * not by array identity, so a freshly recomputed but equal list does not
 * needlessly refetch, and a genuinely different one is not mistaken for
 * still-fresh.
 */
export function useSmartAccountBalances(
  address: string | null,
  extraTokenContracts: ExtraTokenContract[] = NO_EXTRA_TOKENS,
) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);
  const extraKey = JSON.stringify(extraTokenContracts);

  useEffect(() => {
    if (!address) {
      return;
    }

    let cancelled = false;

    getSmartAccountBalances(address, JSON.parse(extraKey))
      .then((result) => {
        if (!cancelled) {
          setLoaded({ address, extraKey, state: { status: "loaded", result } });
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setLoaded({
            address,
            extraKey,
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
  }, [address, reloadIndex, extraKey]);

  const retry = useCallback(() => {
    setReloadIndex((n) => n + 1);
  }, []);

  if (!address) {
    return { state: { status: "idle" } as const, retry };
  }

  if (loaded && loaded.address === address && loaded.extraKey === extraKey) {
    return { state: loaded.state, retry };
  }

  return { state: { status: "loading" } as const, retry };
}
