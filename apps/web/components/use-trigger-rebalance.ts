"use client";

import { useCallback, useState } from "react";

type TriggerState =
  | { status: "idle" }
  | { status: "submitting" }
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

  const trigger = useCallback(async (account: string): Promise<boolean> => {
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const data = await res.json();
      if (data.success) {
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
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, trigger, reset };
}
