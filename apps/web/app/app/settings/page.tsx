"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { usePolicyStatus } from "@/components/use-policy-status";
import { RevokePolicyPanel } from "@/components/revoke-policy-panel";
import { SettingsConnectView, SettingsView } from "@/components/app/settings-view";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail silently (permissions, insecure
      // context); nothing here is worth surfacing as an error.
    }
  };

  return (
    <Button size="sm" onClick={() => void handleCopy()} className="flex-none">
      <Icon name={copied ? "check" : "copy"} size={16} />
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { address, restoring, connecting, creationStage, error, createWallet, connectWallet } = useWallet();
  const { state: policyState, retry: retryPolicy } = usePolicyStatus(address);
  // Set by a successful revoke in this visit, and gone when the page is.
  // It keeps the revoke confirmation on screen after the policy refetch
  // reads empty, and stands in for the policy cards while it does.
  const [revoked, setRevoked] = useState(false);

  if (!address) {
    return (
      <SettingsConnectView
        restoring={restoring}
        connecting={connecting}
        creationStage={creationStage}
        error={error}
        onCreate={() => void createWallet()}
        onConnect={() => void connectWallet()}
      />
    );
  }

  const explorerAccountUrl = `https://stellar.expert/explorer/testnet/contract/${address}`;
  const policyInstalled = policyState.status === "loaded" && policyState.result.kind === "installed";

  return (
    <SettingsView
      address={address}
      explorerAccountUrl={explorerAccountUrl}
      copyButton={<CopyAddressButton address={address} />}
      policyState={policyState}
      onRetryPolicy={retryPolicy}
      revoked={revoked}
      revoke={
        policyInstalled || revoked ? (
          <RevokePolicyPanel
            address={address}
            contextRuleId={
              policyState.status === "loaded" && policyState.result.kind === "installed" && !policyState.result.provisional
                ? policyState.result.contextRuleId
                : undefined
            }
            onRevoked={() => setRevoked(true)}
            onContinue={() => router.push("/app")}
          />
        ) : null
      }
    />
  );
}
