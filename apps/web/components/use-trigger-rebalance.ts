"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TriggerStage } from "@/components/app/progress-stages";
import { queryKeys } from "@/components/query-keys";

// The server submits, then waits for the ledger, in one request that
// reports nothing along the way, so "confirming" follows the clock: it
// is shown once the request has been out this long.
const CONFIRMING_AFTER_MS = 5000;

type TriggerState =
  | { status: "idle" }
  | { status: "submitting"; stage: TriggerStage }
  | { status: "success"; hash: string; ledger: number | null }
  | { status: "error"; message: string };

/**
 * Submits a real permissionless rebalance via /api/rebalance, sourced
 * and fee-paid by the server's own deployer/keeper key. No passkey
 * ceremony happens here: the connected user is not signing anything,
 * they are only asking the keeper to submit on the account's behalf.
 */
export function useTriggerRebalance() {
  const [state, setState] = useState<TriggerState>({ status: "idle" });
  const queryClient = useQueryClient();

  const trigger = useCallback(async (account: string): Promise<boolean> => {
    setState({ status: "submitting", stage: "submitting" });
    const confirmingTimer = setTimeout(() => setState({ status: "submitting", stage: "confirming" }), CONFIRMING_AFTER_MS);
    try {
      const res = await fetch("/api/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const data = await res.json();
      if (data.success) {
        // A rebalance moves funds, so the balances change, and the prices
        // behind the valuation are read again with them. It also changes
        // whether another rebalance is due (the cooldown starts). The
        // policy itself is untouched: its stored terms do not change.
        void queryClient.invalidateQueries({ queryKey: queryKeys.balances(account), refetchType: "all" });
        void queryClient.invalidateQueries({ queryKey: queryKeys.allPrices, refetchType: "all" });
        void queryClient.invalidateQueries({ queryKey: queryKeys.rebalanceCheck(account), refetchType: "all" });
        setState({ status: "success", hash: data.hash, ledger: data.ledger ?? null });
        return true;
      }
      setState({
        status: "error",
        message: data.message || "This rebalance is no longer due. Refresh to see the current state.",
      });
      return false;
    } catch (err) {
      console.error(err);
      setState({ status: "error", message: "Could not reach the server to submit this rebalance." });
      return false;
    } finally {
      clearTimeout(confirmingTimer);
    }
  }, [queryClient]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, trigger, reset };
}
