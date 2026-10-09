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
  const { address, connecting, error, createWallet, connectWallet } = useWallet();
  const { state: policyState, retry: retryPolicy } = usePolicyStatus(address);

  if (!address) {
    return (
      <SettingsConnectView
        connecting={connecting}
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
      revoke={
        policyInstalled ? (
          <RevokePolicyPanel
            address={address}
            onRevoked={retryPolicy}
            onContinue={() => router.push("/app")}
          />
        ) : null
      }
    />
  );
}
