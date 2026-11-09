"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TriggerStage } from "@/components/app/progress-stages";
import { refreshBalancesAfterRebalance } from "@/components/balances-floor";
import { queryKeys } from "@/components/query-keys";
import { refreshCheckAfterRebalance } from "@/components/rebalance-check-floor";
import { settleQuery } from "@/components/query-settle";
import { fetchRebalanceCheck, type RebalanceCheckResult } from "@/components/use-rebalance-check";

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
    // What the screen held when the rebalance was asked for: with no ledger
    // to hold the check to, a read after it is compared against this to tell
    // the chain has caught up.
    const checkBefore = queryClient.getQueryData<RebalanceCheckResult>(queryKeys.rebalanceCheck(account));
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
        //
        // The first read after the confirmed transaction can still see the
        // chain as it was, so the balances and the check are held to the
        // floor the rebalance raises (see account-ledger-floor.ts): what is
        // on screen stays, behind the success card, until a reading at or
        // above the rebalance's ledger replaces it. The valuation is
        // arithmetic over those balances and the prices, so it follows.
        void queryClient.invalidateQueries({ queryKey: queryKeys.allPrices, refetchType: "all" });
        if (typeof data.ledger === "number") {
          void refreshBalancesAfterRebalance(queryClient, account, data.ledger);
        } else {
          // The server did not give the ledger, so there is no floor: the
          // balances are simply read again.
          void queryClient.invalidateQueries({ queryKey: queryKeys.balances(account), refetchType: "all" });
        }
        // The check is held to the same floor (see rebalance-check-floor.ts).
        // Without the ledger it is read until it differs from what was on
        // screen before.
        if (typeof data.ledger === "number") {
          void refreshCheckAfterRebalance(queryClient, account, data.ledger);
        } else if (checkBefore) {
          const checkBeforeJson = JSON.stringify(checkBefore);
          void settleQuery({
            queryClient,
            queryKey: queryKeys.rebalanceCheck(account),
            read: () => fetchRebalanceCheck(account),
            isSettled: (check) => JSON.stringify(check) !== checkBeforeJson,
          });
        } else {
          void queryClient.invalidateQueries({ queryKey: queryKeys.rebalanceCheck(account), refetchType: "all" });
        }
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
