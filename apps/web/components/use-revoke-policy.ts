"use client";

import { useCallback, useState } from "react";
import { getKit } from "@/components/wallet-provider";
import { findPolicyContextRuleId } from "@/lib/stellar/policy";

type RevokeState =
  | { status: "idle" }
  | { status: "revoking" }
  | { status: "success"; hash: string; ledger: number | null }
  | { status: "error"; message: string };

function describeRevokeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError") {
      return "The passkey request was cancelled.";
    }
    if (err.message) {
      return err.message;
    }
  }
  return "Could not revoke the policy. Try again.";
}

/**
 * Revokes (uninstalls) the connected smart account's rebalance policy:
 * one signed transaction, the exact mirror of useInstallPolicy. This
 * removes the account's context rule and, in the same transaction, the
 * smart account automatically calls the policy contract's own uninstall,
 * clearing its stored params. Funds are never touched: this only deletes
 * the standing authorization, not any balance.
 */
export function useRevokePolicy() {
  const [state, setState] = useState<RevokeState>({ status: "idle" });

  const revoke = useCallback(async (smartAccount: string): Promise<boolean> => {
    setState({ status: "revoking" });
    try {
      const contextRuleId = await findPolicyContextRuleId(smartAccount);
      if (contextRuleId === null) {
        setState({ status: "error", message: "No active policy was found to revoke." });
        return false;
      }

      const kit = getKit();
      const tx = await kit.rules.remove(contextRuleId);
      const result = await kit.signAndSubmit(tx);

      if (!result.success) {
        setState({ status: "error", message: result.error?.message || "The transaction failed to submit." });
        return false;
      }

      setState({ status: "success", hash: result.hash, ledger: result.ledger ?? null });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        // Not an error state: the user simply chose not to sign. Back to
        // idle, exactly as if they had not clicked revoke at all.
        setState({ status: "idle" });
        return false;
      }
      console.error(err);
      setState({ status: "error", message: describeRevokeError(err) });
      return false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, revoke, reset };
}
