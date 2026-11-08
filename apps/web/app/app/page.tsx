"use client";

import { useMemo } from "react";
import { truncateAddress, useWallet } from "@/components/wallet-provider";
import { useSmartAccountBalances } from "@/components/use-smart-account-balances";
import { usePolicyStatus } from "@/components/use-policy-status";
import { useRebalanceCheck } from "@/components/use-rebalance-check";
import { useTriggerRebalance } from "@/components/use-trigger-rebalance";
import { usePortfolioValuation, type PortfolioValuationInput } from "@/components/use-portfolio-value";
import { DashboardConnectView, DashboardView } from "@/components/app/dashboard-view";

export default function DashboardPage() {
  const { address, restoring, connecting, creationStage, error, createWallet, connectWallet } = useWallet();
  const { state: policyState, retry: retryPolicy } = usePolicyStatus(address);

  const { state: balancesState, retry: retryBalances } = useSmartAccountBalances(address);
  const { state: rebalanceState, retry: retryRebalanceCheck } = useRebalanceCheck(address);
  const { state: triggerState, trigger: triggerRebalance } = useTriggerRebalance();

  // The prices only need the policy, so the valuation is handed its input
  // as soon as a policy is installed; a balance is null until the
  // balances have loaded.
  const valuationInput: PortfolioValuationInput | null = useMemo(() => {
    if (policyState.status !== "loaded" || policyState.result.kind !== "installed") {
      return null;
    }
    const balances =
      balancesState.status !== "loaded" ? null : balancesState.result.kind === "funded" ? balancesState.result.balances : [];
    const findBalance = (contract: string) =>
      balances === null ? null : (balances.find((b) => b.contract === contract)?.balance ?? "0");
    const { params } = policyState.result;
    return {
      oracle: params.oracle,
      sellAsset: { contract: params.sellAsset, symbol: params.sellSymbol, balance: findBalance(params.sellAsset) },
      buyAsset: { contract: params.buyAsset, symbol: params.buySymbol, balance: findBalance(params.buyAsset) },
      targetBuyWeightBps: params.targetBuyWeightBps,
      bandThresholdBps: params.bandThresholdBps,
    };
  }, [policyState, balancesState]);

  const { state: valuationState } = usePortfolioValuation(valuationInput);

  const policyInstalled = policyState.status === "loaded" && policyState.result.kind === "installed";

  const handleTrigger = async () => {
    if (!address) return;
    const succeeded = await triggerRebalance(address);
    if (succeeded) {
      retryPolicy();
      retryBalances();
      retryRebalanceCheck();
    }
  };

  if (!address) {
    return (
      <DashboardConnectView
        restoring={restoring}
        connecting={connecting}
        creationStage={creationStage}
        error={error}
        onCreate={() => void createWallet()}
        onConnect={() => void connectWallet()}
      />
    );
  }

  return (
    <DashboardView
      accountLabel={truncateAddress(address)}
      walletError={error}
      policyState={policyState}
      valuationState={valuationState}
      rebalanceState={rebalanceState}
      triggerState={triggerState}
      balancesState={balancesState}
      policyInstalled={policyInstalled}
      onRetryPolicy={retryPolicy}
      onRetryBalances={retryBalances}
      onRetryRebalanceCheck={retryRebalanceCheck}
      onTrigger={() => void handleTrigger()}
    />
  );
}
