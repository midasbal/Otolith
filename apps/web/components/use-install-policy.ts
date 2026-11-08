"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createDefaultContext } from "smart-account-kit";
import type { InstallStage } from "@/components/app/progress-stages";
import { queryKeys } from "@/components/query-keys";
import { settleQuery } from "@/components/query-settle";
import { fetchRebalanceCheck } from "@/components/use-rebalance-check";
import { getPolicyStatus } from "@/lib/stellar";
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
      const tx = await kit.rules.add(createDefaultContext(), ruleName, [], new Map([[POLICY_CONTRACT, gateParams]]));
      setState({ status: "installing", stage: "authorizing" });
      confirmingTimer = setTimeout(() => setState({ status: "installing", stage: "confirming" }), CONFIRMING_AFTER_MS);
      const result = await kit.signAndSubmit(tx);

      if (!result.success) {
        setState({ status: "error", message: result.error?.message || "The transaction failed to submit." });
        return;
      }

      // Installing moves no funds, so the balances and prices stand. What it
      // does change is whether the account has a policy at all, and with it
      // the answer to "is a rebalance due". The transaction is confirmed,
      // but the first read after it can still see the chain as it was, so
      // both are read until they show the policy (see query-settle.ts), and
      // only then is the install reported done: whoever goes on to the
      // dashboard finds it installed. If the chain does not show it in time
      // this falls back to an ordinary re-read and the install is reported
      // all the same, because it did succeed.
      if (address) {
        clearTimeout(confirmingTimer);
        setState({ status: "installing", stage: "confirming" });
        await Promise.all([
          settleQuery({
            queryClient,
            queryKey: queryKeys.policy(address),
            read: () => getPolicyStatus(address),
            isSettled: (policy) => policy.kind === "installed",
          }),
          settleQuery({
            queryClient,
            queryKey: queryKeys.rebalanceCheck(address),
            read: () => fetchRebalanceCheck(address),
            isSettled: (check) => check.state !== "no_policy",
          }),
        ]);
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
