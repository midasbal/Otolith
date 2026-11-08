"use client";

import { useState } from "react";
import { RevokePolicyView } from "@/components/app/revoke-policy-view";
import { useRevokePolicy } from "@/components/use-revoke-policy";

type RevokePolicyPanelProps = {
  address: string;
  onContinue: () => void;
};

/**
 * The revoke control's one source of truth: the two-step inline confirm,
 * the honest copy about what revoking does and does not touch, and the
 * post-revoke success view with the transaction hash. Settings is this
 * panel's only home; keep it that way rather than rendering it a second
 * time elsewhere.
 */
export function RevokePolicyPanel({ address, onContinue }: RevokePolicyPanelProps) {
  const { state, revoke } = useRevokePolicy();
  const [confirming, setConfirming] = useState(false);

  const handleRevoke = async () => {
    setConfirming(false);
    // The revoke itself invalidates what it changes (the policy and the
    // rebalance check), so nothing is read again here.
    await revoke(address);
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
