"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { applyConfirmedPolicy } from "@/components/policy-ledger-floor";
import { queryKeys } from "@/components/query-keys";
import { settleQuery } from "@/components/query-settle";
import { fetchRebalanceCheck } from "@/components/use-rebalance-check";
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
  const queryClient = useQueryClient();

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

      // Revoking moves no funds, so the balances and prices stand. The policy
      // is gone, and so is any rebalance that was due under it.
      //
      // The mirror of an install: "not installed" is written into the cache
      // now, behind a floor at the transaction's ledger, so no read
      // evaluated before it can bring the policy back (see
      // policy-ledger-floor.ts), and the chain's own answer replaces it in
      // the background. Without the ledger the policy is simply read again.
      if (typeof result.ledger === "number") {
        await applyConfirmedPolicy(queryClient, smartAccount, result.ledger, { kind: "not-installed", reason: "no-rule" });
      } else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.policy(smartAccount), refetchType: "all" });
      }
      // The rebalance check is read by the server, not through the floor
      // (a later stage): read until it shows no policy, behind the success.
      void settleQuery({
        queryClient,
        queryKey: queryKeys.rebalanceCheck(smartAccount),
        read: () => fetchRebalanceCheck(smartAccount),
        isSettled: (check) => check.state === "no_policy",
      });

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
  }, [queryClient]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, revoke, reset };
}
