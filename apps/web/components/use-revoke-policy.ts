"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rpc } from "@stellar/stellar-sdk";
import type { RevokeStage } from "@/components/app/progress-stages";
import { applyConfirmedPolicy } from "@/components/policy-ledger-floor";
import { queryKeys } from "@/components/query-keys";
import { settleQuery } from "@/components/query-settle";
import { fetchRebalanceCheck } from "@/components/use-rebalance-check";
import { signatureExpirationLedger } from "@/components/signature-expiry";
import { signingRuleResolver } from "@/components/signing-rules";
import { cachedSigningRules, refreshSigningRules } from "@/components/signing-rules-cache";
import { getKit } from "@/components/wallet-provider";
import { CONTEXT_RULE_NOT_FOUND_ERROR, findPolicyContextRuleId } from "@/lib/stellar/policy";

// signAndSubmit reports nothing between asking for the passkey and the
// transaction landing, so "confirming" follows the clock, not the call:
// it is shown once this long has passed since signing began.
const CONFIRMING_AFTER_MS = 8000;

type RevokeState =
  | { status: "idle" }
  | { status: "revoking"; stage: RevokeStage }
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

  // `knownRuleId` is the rule id from the policy status the screen is
  // showing, when that status is a real reading. It saves looking the id
  // up again; if the chain has no such rule, the id is looked up as it
  // always was.
  const revoke = useCallback(async (smartAccount: string, knownRuleId?: number): Promise<boolean> => {
    setState({ status: "revoking", stage: "preparing" });
    let confirmingTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const kit = getKit();
      // The signature's expiry is read alongside the lookup and the build
      // rather than after them (see signature-expiry.ts).
      const expirationRead = signatureExpirationLedger(kit);

      const buildRemoval = async (contextRuleId: number) => {
        const built = await kit.rules.remove(contextRuleId);
        // A rule id the chain does not have does not throw here: the failed
        // simulation is recorded on the transaction and would only surface
        // when signing starts. So it is checked for now.
        const simulation = built.simulation;
        if (simulation && rpc.Api.isSimulationError(simulation) && simulation.error.includes(CONTEXT_RULE_NOT_FOUND_ERROR)) {
          return null;
        }
        return built;
      };

      let contextRuleId = knownRuleId ?? null;
      let tx = contextRuleId === null ? null : await buildRemoval(contextRuleId);
      if (tx === null) {
        contextRuleId = await findPolicyContextRuleId(smartAccount);
        if (contextRuleId === null) {
          setState({ status: "error", message: "No active policy was found to revoke." });
          return false;
        }
        tx = await buildRemoval(contextRuleId);
        if (tx === null) {
          setState({ status: "error", message: "No active policy was found to revoke." });
          return false;
        }
      }

      setState({ status: "revoking", stage: "authorizing" });
      confirmingTimer = setTimeout(() => setState({ status: "revoking", stage: "confirming" }), CONFIRMING_AFTER_MS);

      // If the account's rules were listed ahead of time, sign with the rule
      // ids worked out from that listing rather than have the kit list them
      // again now (see signing-rules.ts). With no listing, the kit does it.
      const resolveContextRuleIds = signingRuleResolver(
        cachedSigningRules(queryClient, smartAccount),
        kit.credentialId,
        () => tx.simulationData.result.auth,
      );
      const result = await kit.signAndSubmit(tx, {
        expiration: await expirationRead,
        ...(resolveContextRuleIds ? { resolveContextRuleIds } : {}),
      });

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
      refreshSigningRules(queryClient, smartAccount, kit);
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
    } finally {
      clearTimeout(confirmingTimer);
    }
  }, [queryClient]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, revoke, reset };
}
