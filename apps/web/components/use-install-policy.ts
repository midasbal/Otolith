"use client";

import { useCallback, useState } from "react";
import { createDefaultContext } from "smart-account-kit";
import { getKit } from "@/components/wallet-provider";
import { buildRebalancePolicyGateParamsScVal, type RebalancePolicyInstallParams } from "@/lib/stellar/policy-params";
import { POLICY_CONTRACT } from "@/lib/stellar/policy-config";

type InstallState =
  | { status: "idle" }
  | { status: "installing" }
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

  const install = useCallback(async (params: RebalancePolicyInstallParams, ruleName: string) => {
    setState({ status: "installing" });
    try {
      const gateParams = buildRebalancePolicyGateParamsScVal(params);
      const kit = getKit();
      const tx = await kit.rules.add(createDefaultContext(), ruleName, [], new Map([[POLICY_CONTRACT, gateParams]]));
      const result = await kit.signAndSubmit(tx);

      if (!result.success) {
        setState({ status: "error", message: result.error?.message || "The transaction failed to submit." });
        return;
      }

      setState({ status: "success", hash: result.hash, ledger: result.ledger ?? null });
    } catch (err) {
      console.error(err);
      setState({ status: "error", message: describeInstallError(err) });
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, install, reset };
}
