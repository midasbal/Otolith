"use client";

import { useMemo } from "react";
import { truncateAddress, useWallet } from "@/components/wallet-provider";
import { useSmartAccountBalances } from "@/components/use-smart-account-balances";
import { usePolicyStatus } from "@/components/use-policy-status";
import { useRebalanceCheck } from "@/components/use-rebalance-check";
import { useTriggerRebalance } from "@/components/use-trigger-rebalance";
import { usePortfolioValuation, type PortfolioValuationInput } from "@/components/use-portfolio-value";
import { FundInLira } from "@/components/fund-in-lira";
import { DashboardConnectView, DashboardView } from "@/components/app/dashboard-view";
import type { ExtraTokenContract } from "@/lib/stellar";
import { BUY_ASSET } from "@/lib/stellar/policy-config";

export default function DashboardPage() {
  const { address, connecting, error, createWallet, connectWallet } = useWallet();
  const { state: policyState, retry: retryPolicy } = usePolicyStatus(address);

  const extraTokenContracts: ExtraTokenContract[] = useMemo(() => {
    // The portfolio's own USDC is always worth checking, even before a
    // policy is installed: a lira deposit can land here first.
    const base: ExtraTokenContract[] = [{ contract: BUY_ASSET.contract, code: BUY_ASSET.symbol }];
    if (policyState.status === "loaded" && policyState.result.kind === "installed") {
      const { params } = policyState.result;
      return [...base, { contract: params.sellAsset, code: params.sellSymbol }, { contract: params.buyAsset, code: params.buySymbol }];
    }
    return base;
  }, [policyState]);

  const { state: balancesState, retry: retryBalances } = useSmartAccountBalances(address, extraTokenContracts);
  const { state: rebalanceState, retry: retryRebalanceCheck } = useRebalanceCheck(address);
  const { state: triggerState, trigger: triggerRebalance } = useTriggerRebalance();

  const valuationInput: PortfolioValuationInput | null = useMemo(() => {
    if (policyState.status !== "loaded" || policyState.result.kind !== "installed") {
      return null;
    }
    if (balancesState.status !== "loaded") {
      return null;
    }
    const balances = balancesState.result.kind === "funded" ? balancesState.result.balances : [];
    const findBalance = (contract: string) => balances.find((b) => b.contract === contract)?.balance ?? "0";
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
        connecting={connecting}
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
      fund={<FundInLira account={address} onDeposited={retryBalances} />}
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
