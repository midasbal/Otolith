"use client";

import { useState } from "react";
import { RevokePolicyView } from "@/components/app/revoke-policy-view";
import { useRevokePolicy } from "@/components/use-revoke-policy";

type RevokePolicyPanelProps = {
  address: string;
  /**
   * The rule id of the policy on screen, when it came from a real reading of
   * the chain. Saves looking it up again to revoke it.
   */
  contextRuleId?: number;
  /** Called once, after a revoke has been confirmed on-chain. */
  onRevoked: () => void;
  onContinue: () => void;
};

/**
 * The revoke control's one source of truth: the two-step inline confirm,
 * the honest copy about what revoking does and does not touch, and the
 * post-revoke success view with the transaction hash. Settings is this
 * panel's only home; keep it that way rather than rendering it a second
 * time elsewhere.
 */
export function RevokePolicyPanel({ address, contextRuleId, onRevoked, onContinue }: RevokePolicyPanelProps) {
  const { state, revoke } = useRevokePolicy();
  const [confirming, setConfirming] = useState(false);

  const handleRevoke = async () => {
    setConfirming(false);
    // The revoke itself invalidates what it changes (the policy and the
    // rebalance check), so nothing is read again here. The caller is told
    // so it can keep this panel on screen once the policy reads empty.
    const succeeded = await revoke(address, contextRuleId);
    if (succeeded) {
      onRevoked();
    }
  };

  return (
    <RevokePolicyView
      state={state}
      confirming={confirming}
      onAskConfirm={() => setConfirming(true)}
      onCancel={() => setConfirming(false)}
      onConfirm={() => void handleRevoke()}
      onContinue={onContinue}
    />
  );
}
