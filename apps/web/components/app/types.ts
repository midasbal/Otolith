/*
  The shapes the app's presentational views take, derived from the hooks
  that produce them. Every import here is type-only, so it is erased when
  the app is built: a view (and the /dev/ui gallery that renders the views
  from mock data) depends on a hook's types without ever loading the hook,
  the wallet kit, or anything that talks to the chain.

  Because each type is read off the hook itself, a view cannot drift from
  what its container actually passes it.
*/
import type { useDepositTry } from "@/components/use-deposit-try";
import type { useInstallPolicy } from "@/components/use-install-policy";
import type { useLivePrices } from "@/components/use-live-prices";
import type { usePolicyStatus } from "@/components/use-policy-status";
import type { usePortfolioValuation } from "@/components/use-portfolio-value";
import type { useRebalanceCheck } from "@/components/use-rebalance-check";
import type { useRebalanceHistory } from "@/components/use-rebalance-history";
import type { useRevokePolicy } from "@/components/use-revoke-policy";
import type { useSmartAccountBalances } from "@/components/use-smart-account-balances";
import type { useTriggerRebalance } from "@/components/use-trigger-rebalance";

export type PolicyState = ReturnType<typeof usePolicyStatus>["state"];
export type BalancesState = ReturnType<typeof useSmartAccountBalances>["state"];
export type ValuationState = ReturnType<typeof usePortfolioValuation>["state"];
export type RebalanceState = ReturnType<typeof useRebalanceCheck>["state"];
export type TriggerState = ReturnType<typeof useTriggerRebalance>["state"];
export type DepositState = ReturnType<typeof useDepositTry>["state"];
export type InstallState = ReturnType<typeof useInstallPolicy>["state"];
export type RevokeState = ReturnType<typeof useRevokePolicy>["state"];
export type HistoryState = ReturnType<typeof useRebalanceHistory>["state"];
export type LivePricesState = ReturnType<typeof useLivePrices>;

/** The policy terms shown on the dashboard and in Settings. */
export type PolicyTerms = Extract<Extract<PolicyState, { status: "loaded" }>["result"], { kind: "installed" }>["params"];
