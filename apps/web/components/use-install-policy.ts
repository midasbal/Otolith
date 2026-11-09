"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createDefaultContext } from "smart-account-kit";
import type { InstallStage } from "@/components/app/progress-stages";
import { applyConfirmedPolicy } from "@/components/policy-ledger-floor";
import { queryKeys } from "@/components/query-keys";
import { settleQuery } from "@/components/query-settle";
import { fetchRebalanceCheck } from "@/components/use-rebalance-check";
import { signatureExpirationLedger } from "@/components/signature-expiry";
import { signingRuleResolver } from "@/components/signing-rules";
import { cachedSigningRules, refreshSigningRules } from "@/components/signing-rules-cache";
import { getKit, useWallet } from "@/components/wallet-provider";
import { buildRebalancePolicyGateParamsScVal, type RebalancePolicyInstallParams } from "@/lib/stellar/policy-params";
import { POLICY_CONTRACT } from "@/lib/stellar/policy-config";

// signAndSubmit reports nothing between asking for the passkey and the
// transaction landing, so "confirming" follows the clock, not the call:
// it is shown once this long has passed since signing began.
const CONFIRMING_AFTER_MS = 8000;

type InstallState =
  | { status: "idle" }
  | { status: "installing"; stage: InstallStage }
  | { status: "success"; hash: string; ledger: number | null }
  | { status: "error"; message: string };

function describeInstallError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError") {
      return "The passkey request was cancelled.";
    }
    if (err.message) {
      return err.message;
    }
  }
  return "Could not install the policy. Try again.";
}

// The id the new rule will have, from the add_context_rule simulation the
// kit already ran to build the transaction; null if it cannot be read.
function newRuleId(tx: { result: { id: number } }): number | null {
  try {
    const id = tx.result.id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

/**
 * Installs a rebalance policy on the connected smart account: one signed
 * transaction, one host-function op, sponsored automatically via the
 * existing deployer relayer. Zero signers on the rule (a permissionless
 * trigger, matching the contract's own design: anyone can call rebalance,
 * but only within the bounds set here).
 */
export function useInstallPolicy() {
  const [state, setState] = useState<InstallState>({ status: "idle" });
  const queryClient = useQueryClient();
  const { address } = useWallet();

  const install = useCallback(async (params: RebalancePolicyInstallParams, ruleName: string) => {
    setState({ status: "installing", stage: "preparing" });
    let confirmingTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const gateParams = buildRebalancePolicyGateParamsScVal(params);
      const kit = getKit();
      // The signature's expiry is read alongside building the transaction
      // rather than after it (see signature-expiry.ts).
      const [tx, expiration] = await Promise.all([
        kit.rules.add(createDefaultContext(), ruleName, [], new Map([[POLICY_CONTRACT, gateParams]])),
        signatureExpirationLedger(kit),
      ]);
      setState({ status: "installing", stage: "authorizing" });
      confirmingTimer = setTimeout(() => setState({ status: "installing", stage: "confirming" }), CONFIRMING_AFTER_MS);
      // If the account's rules were listed ahead of time, sign with the rule
      // ids worked out from that listing rather than have the kit list them
      // again now (see signing-rules.ts). With no listing, the kit does it.
      const resolveContextRuleIds = address
        ? signingRuleResolver(cachedSigningRules(queryClient, address), kit.credentialId, () => tx.simulationData.result.auth)
        : undefined;
      const result = await kit.signAndSubmit(tx, { expiration, ...(resolveContextRuleIds ? { resolveContextRuleIds } : {}) });

      if (!result.success) {
        setState({ status: "error", message: result.error?.message || "The transaction failed to submit." });
        return;
      }

      // Installing moves no funds, so the balances and prices stand. What it
      // does change is whether the account has a policy at all, and with it
      // the answer to "is a rebalance due".
      //
      // The policy is written into the cache now, from what was just
      // installed, behind a floor at the transaction's ledger: the screen is
      // right the moment the install is, and no read evaluated before that
      // ledger can undo it (see policy-ledger-floor.ts). The chain's own
      // answer replaces it in the background. Without the ledger, or the new
      // rule's id, there is nothing safe to floor or write, so the policy is
      // simply read again, as it was before the floor existed.
      if (address) {
        refreshSigningRules(queryClient, address, kit);
        const ruleId = newRuleId(tx);
        if (typeof result.ledger === "number" && ruleId !== null) {
          await applyConfirmedPolicy(queryClient, address, result.ledger, {
            kind: "installed",
            contextRuleId: ruleId,
            params: { ...params, pair: params.sellAsset },
            provisional: true,
          });
        } else {
          void queryClient.invalidateQueries({ queryKey: queryKeys.policy(address), refetchType: "all" });
        }
        // The rebalance check is read by the server, not through the floor
        // (a later stage): read until it shows a policy, behind the success.
        void settleQuery({
          queryClient,
          queryKey: queryKeys.rebalanceCheck(address),
          read: () => fetchRebalanceCheck(address),
          isSettled: (check) => check.state !== "no_policy",
        });
      }

      setState({ status: "success", hash: result.hash, ledger: result.ledger ?? null });
    } catch (err) {
      console.error(err);
      setState({ status: "error", message: describeInstallError(err) });
    } finally {
      clearTimeout(confirmingTimer);
    }
  }, [queryClient, address]);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, install, reset };
}
