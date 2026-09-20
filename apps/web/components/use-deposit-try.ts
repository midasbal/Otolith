"use client";

import { useCallback, useState } from "react";

export type DepositStageEvent = {
  stage: "creating_deposit" | "bank_settling" | "usdc_delivered" | "forwarded" | "done";
  label: string;
  detail?: string;
  txHash?: string;
};

type DepositState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; amountUsdc: string; forwardTxHash: string; stages: DepositStageEvent[] }
  | { status: "error"; message: string; stages: DepositStageEvent[] };

/**
 * Runs the lira deposit flow via /api/deposit-try, driven entirely by the
 * server's own relay key. No passkey ceremony happens here: the user
 * never signs anything for this deposit, the relay does.
 */
export function useDepositTry() {
  const [state, setState] = useState<DepositState>({ status: "idle" });

  const deposit = useCallback(async (account: string, amountTry: string): Promise<boolean> => {
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/deposit-try", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, amountTry }),
      });
      const data = await res.json();
      if (data.success) {
        setState({
          status: "success",
          amountUsdc: data.amountUsdc,
          forwardTxHash: data.forwardTxHash,
          stages: data.stages ?? [],
        });
        return true;
      }
      setState({
        status: "error",
        message: data.message || "The deposit could not be completed.",
        stages: data.stages ?? [],
      });
      return false;
    } catch (err) {
      console.error(err);
      setState({ status: "error", message: "Could not reach the server to start this deposit.", stages: [] });
      return false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, deposit, reset };
}
