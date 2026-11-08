"use client";

import { truncateAddress, useWallet } from "@/components/wallet-provider";
import { useRebalanceHistory } from "@/components/use-rebalance-history";
import { ActivityConnectView, ActivityView } from "@/components/app/activity-view";

export default function ActivityPage() {
  const { address, restoring, connecting, creationStage, error, createWallet, connectWallet } = useWallet();
  const { state, retry } = useRebalanceHistory(address);

  if (!address) {
    return (
      <ActivityConnectView
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

  return (
    <ActivityView
      accountLabel={truncateAddress(address)}
      state={state}
      onRetry={retry}
      explorerAccountUrl={explorerAccountUrl}
      shortenAddress={truncateAddress}
    />
  );
}
