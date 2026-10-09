"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ActivityConnectView, ActivityView } from "@/components/app/activity-view";
import { AllocationPanel, DashboardConnectView, DashboardView } from "@/components/app/dashboard-view";
import { ExploreView, type ExploreAsset } from "@/components/app/explore-view";
import { FundInLiraView } from "@/components/app/fund-in-lira-view";
import { RevokePolicyView } from "@/components/app/revoke-policy-view";
import { SettingsConnectView, SettingsView } from "@/components/app/settings-view";
import { SetupView } from "@/components/app/setup-view";
import { AccountStatusView, SidebarView } from "@/components/app/shell-view";
import { Background } from "@/components/background/background";
import type {
  BalancesState,
  DepositState,
  HistoryState,
  InstallState,
  LivePricesState,
  PolicyState,
  PolicyTerms,
  RebalanceState,
  RevokeState,
  TriggerState,
  ValuationState,
} from "@/components/app/types";
import { Screen, ScreenHeader } from "@/components/app/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

/*
  Every app screen in every state, from mock data.

  This file is the whole of the app as the gallery sees it: the same
  presentational views the real pages render, fed by the fixtures below
  instead of by hooks. Nothing in it reads a wallet, a contract, or the
  network, every import of a hook's shape is type-only, and no button
  does anything. The addresses and hashes are made up and say so.
*/

const noop = () => {};

// ── Fixtures ───────────────────────────────────────────────────────────

const ADDRESS = "CMOCKACCOUNT000NOTAREALADDRESS000FORTHEUIGALLERYONLY0XLM";
const KEEPER = "GMOCKKEEPER0000NOTAREALADDRESS000FORTHEUIGALLERYONLY0ABC";
const HASH = "3f1c9a7e52b84d06a1e7c4f9b2d5083e6a7f41c9d8e2b05a3c6f7e1d4b9a8c20";
const HASH_2 = "a04be19c7d3352f8e6610b9d4c7a2f18e3d95b06c4a7718f2e0d6b53a9c41e77";

/** The same shortening the app applies to an address, for display. */
const shorten = (address: string) => (address.length <= 12 ? address : `${address.slice(0, 4)}...${address.slice(-4)}`);

const TERMS: PolicyTerms = {
  sellAsset: "CMOCKXLM0000000000000000000000000000000000000000000000SELL",
  buyAsset: "CMOCKUSDC000000000000000000000000000000000000000000000BUY",
  router: "CMOCKROUTER0000000000000000000000000000000000000000000000",
  pair: "CMOCKPAIR000000000000000000000000000000000000000000000000",
  oracle: "CMOCKORACLE0000000000000000000000000000000000000000000000",
  sellSymbol: "XLM",
  buySymbol: "USDC",
  slippageToleranceBps: 100,
  targetBuyWeightBps: 5000,
  bandThresholdBps: 200,
  minTradeSize: 0,
  reservedTipBps: 0,
  maxCostRatioBps: 2500,
  cooldownSecs: 3600,
};

const policy = {
  loading: { status: "loading" },
  error: { status: "error", message: "Could not reach the Stellar network. Check your connection and try again." },
  notInstalled: { status: "loaded", result: { kind: "not-installed", reason: "no-rule" } },
  installed: { status: "loaded", result: { kind: "installed", contextRuleId: 1, params: TERMS } },
} satisfies Record<string, PolicyState>;

type Valued = Extract<Extract<ValuationState, { status: "loaded" }>["result"], { kind: "valued" }>;

function valuedResult(
  currentBuyWeightBps: number,
  totalUsdValue: number,
  terms: { targetBuyWeightBps: number; bandThresholdBps: number } = TERMS,
): Valued {
  const driftBps = currentBuyWeightBps - terms.targetBuyWeightBps;
  const buyValue = (totalUsdValue * currentBuyWeightBps) / 10000;
  return {
    kind: "valued",
    totalUsdValue,
    sellAsset: { code: "XLM", contract: TERMS.sellAsset, balance: "9412.5567", price: 0.0734, usdValue: totalUsdValue - buyValue },
    buyAsset: { code: "USDC", contract: TERMS.buyAsset, balance: String(buyValue), price: 1, usdValue: buyValue },
    currentBuyWeightBps,
    targetBuyWeightBps: terms.targetBuyWeightBps,
    bandThresholdBps: terms.bandThresholdBps,
    driftBps,
    // The same rule as lib/stellar/portfolio-value.ts.
    bandState: driftBps >= 0 ? "overweight" : -driftBps > terms.bandThresholdBps ? "past_band" : "within_band",
  };
}

function valued(currentBuyWeightBps: number, totalUsdValue: number): ValuationState {
  return { status: "loaded", result: valuedResult(currentBuyWeightBps, totalUsdValue) };
}

const valuation = {
  loading: { status: "loading" },
  error: { status: "error", message: "Could not compute the portfolio's live value right now." },
  unavailable: { status: "loaded", result: { kind: "unavailable", reason: "A live price is not available for this pair right now." } },
  withinBand: valued(4933, 1284.5),
  pastBand: valued(4620, 1271.32),
  overweight: valued(5210, 1302.08),
  farPastBand: valued(204, 1284.5),
} satisfies Record<string, ValuationState>;

const balances = {
  loading: { status: "loading" },
  error: { status: "error", message: "Could not reach the Stellar network. Check your connection and try again." },
  empty: { status: "loaded", result: { kind: "empty" } },
  funded: {
    status: "loaded",
    result: {
      kind: "funded",
      balances: [
        { code: "XLM", contract: TERMS.sellAsset, balance: "9412.5567000" },
        { code: "USDC", contract: TERMS.buyAsset, balance: "633.6938500" },
      ],
    },
  },
  xlmOnly: {
    status: "loaded",
    result: { kind: "funded", balances: [{ code: "XLM", contract: TERMS.sellAsset, balance: "10000.0000000" }] },
  },
} satisfies Record<string, BalancesState>;

// The largest figures a screen should still lay out cleanly.
const valuationLarge: ValuationState = { status: "loaded", result: valuedResult(4620, 12345678.9) };
const balancesLarge: BalancesState = {
  status: "loaded",
  result: {
    kind: "funded",
    balances: [
      { code: "XLM", contract: TERMS.sellAsset, balance: "90491234567.1234567" },
      { code: "USDC", contract: TERMS.buyAsset, balance: "5703703651.8765432" },
    ],
  },
};

const rebalance = {
  loading: { status: "loading" },
  error: { status: "error", message: "Could not check whether a rebalance is due." },
  notDue: { status: "loaded", result: { state: "not_due", reason: "BelowBand" } },
  costExceeds: { status: "loaded", result: { state: "not_due", reason: "CostExceedsBenefit" } },
  cooldown: { status: "loaded", result: { state: "cooldown" } },
  poolBlocked: { status: "loaded", result: { state: "pool_blocked" } },
  ready: { status: "loaded", result: { state: "ready", contextRuleId: 1, amountIn: "652.1100000", amountOut: "47.8600000" } },
} satisfies Record<string, RebalanceState>;

const trigger = {
  idle: { status: "idle" },
  submitting: { status: "submitting" },
  success: { status: "success", hash: HASH, ledger: 1482211 },
  error: { status: "error", message: "This rebalance is no longer due. Refresh to see the current state." },
} satisfies Record<string, TriggerState>;

const deposit = {
  idle: { status: "idle" },
  submitting: { status: "submitting" },
  success: {
    status: "success",
    amountUsdc: "12.4300000",
    forwardTxHash: HASH_2,
    stages: [
      { stage: "creating_deposit", label: "Deposit created with the anchor" },
      { stage: "bank_settling", label: "Bank transfer settled (sandbox: simulated)" },
      { stage: "usdc_delivered", label: "Anchor delivered testnet USDC", txHash: HASH },
      { stage: "forwarded", label: "Credited to your portfolio", txHash: HASH_2 },
    ],
  },
  error: {
    status: "error",
    message: "The deposit could not be completed.",
    stages: [
      { stage: "creating_deposit", label: "Deposit created with the anchor" },
      { stage: "bank_settling", label: "Bank transfer settled (sandbox: simulated)" },
    ],
  },
} satisfies Record<string, DepositState>;

const install = {
  idle: { status: "idle" },
  installing: { status: "installing" },
  error: { status: "error", message: "The passkey request was cancelled." },
  success: { status: "success", hash: HASH, ledger: 1482190 },
} satisfies Record<string, InstallState>;

const revoke = {
  idle: { status: "idle" },
  revoking: { status: "revoking" },
  error: { status: "error", message: "No active policy was found to revoke." },
  success: { status: "success", hash: HASH_2, ledger: 1482377 },
} satisfies Record<string, RevokeState>;

const history = {
  loading: { status: "loading" },
  error: { status: "error", message: "Could not reach the Stellar network to read this account's activity." },
  empty: { status: "loaded", result: { entries: [], windowStartLedger: 1442211, windowEndLedger: 1482211 } },
  list: {
    status: "loaded",
    result: {
      windowStartLedger: 1442211,
      windowEndLedger: 1482211,
      entries: [
        { hash: HASH, ledger: 1482190, timestamp: 1791500400, submitter: KEEPER, sellAmount: "652.1100000", buyAmount: "47.8600000" },
        { hash: HASH_2, ledger: 1469004, timestamp: 1791434520, submitter: KEEPER, sellAmount: "318.0045000", buyAmount: "23.4100000" },
      ],
    },
  },
} satisfies Record<string, HistoryState>;

const historyLong: HistoryState = {
  status: "loaded",
  result: {
    windowStartLedger: 1442211,
    windowEndLedger: 1482211,
    entries: [
      { hash: HASH, ledger: 1482190, timestamp: 1791500400, submitter: KEEPER, sellAmount: "90491234567.1234567", buyAmount: "5703703651.8765432" },
      { hash: HASH_2, ledger: 1469004, timestamp: 1791434520, submitter: KEEPER, sellAmount: "0.0000001", buyAmount: "0.0000001" },
    ],
  },
};

const ASSETS: ExploreAsset[] = [
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    contract: TERMS.sellAsset,
    contractLabel: shorten(TERMS.sellAsset),
    role: "The volatile asset in Otolith's pair. It is what an account holds by default, and always the asset the rebalancer sells from.",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    contract: TERMS.buyAsset,
    contractLabel: shorten(TERMS.buyAsset),
    role: "The stable asset in Otolith's pair. It is always the asset the rebalancer buys into, to bring a portfolio back to its target split.",
  },
];

const prices = {
  loading: { status: "loading" },
  error: { status: "error", message: "Could not reach the price oracle." },
  loaded: { status: "loaded", updatedAt: 0, prices: [{ symbol: "XLM", price: 0.0734 }, { symbol: "USDC", price: 0.9998 }] },
  partial: { status: "loaded", updatedAt: 0, prices: [{ symbol: "XLM", price: null }, { symbol: "USDC", price: 0.9998 }] },
} satisfies Record<string, LivePricesState>;

// ── Screens ────────────────────────────────────────────────────────────

const connect = { connecting: false, error: null, onCreate: noop, onConnect: noop };
const CANCELLED = "The passkey request was cancelled.";

function fund(state: DepositState = deposit.idle, amountTry = "500") {
  return (
    <FundInLiraView
      state={state}
      amountTry={amountTry}
      estimate="12.4300000"
      estimating={false}
      onAmountChange={noop}
      onSubmit={noop}
      onReset={noop}
    />
  );
}

type DashboardFixture = {
  policy?: PolicyState;
  valuation?: ValuationState;
  rebalance?: RebalanceState;
  trigger?: TriggerState;
  balances?: BalancesState;
  deposit?: DepositState;
  walletError?: string | null;
};

function dashboard(fixture: DashboardFixture) {
  const policyState = fixture.policy ?? policy.installed;
  return (
    <DashboardView
      accountLabel={shorten(ADDRESS)}
      walletError={fixture.walletError ?? null}
      fund={fund(fixture.deposit)}
      policyState={policyState}
      valuationState={fixture.valuation ?? valuation.withinBand}
      rebalanceState={fixture.rebalance ?? rebalance.notDue}
      triggerState={fixture.trigger ?? trigger.idle}
      balancesState={fixture.balances ?? balances.funded}
      policyInstalled={policyState.status === "loaded" && policyState.result.kind === "installed"}
      onRetryPolicy={noop}
      onRetryBalances={noop}
      onRetryRebalanceCheck={noop}
      onTrigger={noop}
    />
  );
}

/*
  A dashboard that goes through a rebalance on its own fixtures: in
  balance, then past the band, then (when "Rebalance now" is pressed)
  submitting, then confirmed and back in balance. For watching the
  background follow the page. window.__scenario(step) jumps to a step.
*/
type ScenarioStep = "balanced" | "drifting" | "submitting" | "confirmed" | "failed" | "stillDrifting";

declare global {
  interface Window {
    __scenario?: (step: ScenarioStep) => void;
  }
}

function DashboardScenario() {
  const [step, setStep] = useState<ScenarioStep>("balanced");

  useEffect(() => {
    window.__scenario = setStep;
    return () => {
      delete window.__scenario;
    };
  }, []);

  useEffect(() => {
    if (step !== "submitting") return;
    const timer = window.setTimeout(() => setStep("confirmed"), 1400);
    return () => window.clearTimeout(timer);
  }, [step]);

  // "failed": the submission was refused. "stillDrifting": it went through, and the portfolio is past its band all the same.
  const past = step === "drifting" || step === "submitting" || step === "failed" || step === "stillDrifting";
  const submitted = step === "confirmed" || step === "stillDrifting";
  return (
    <DashboardView
      accountLabel={shorten(ADDRESS)}
      walletError={null}
      fund={fund()}
      policyState={policy.installed}
      valuationState={past ? valuation.pastBand : valuation.withinBand}
      rebalanceState={past ? rebalance.ready : rebalance.notDue}
      // A second submission is a second transaction, with its own hash.
      triggerState={
        step === "submitting"
          ? trigger.submitting
          : step === "stillDrifting"
            ? { ...trigger.success, hash: HASH_2 }
            : submitted
              ? trigger.success
              : step === "failed"
                ? trigger.error
                : trigger.idle
      }
      balancesState={balances.funded}
      policyInstalled
      onRetryPolicy={noop}
      onRetryBalances={noop}
      onRetryRebalanceCheck={noop}
      onTrigger={() => setStep("submitting")}
    />
  );
}

/*
  The drift readout at its extremes: every drift worth worrying about, at
  one band width per state, in the same card and at the same width as on
  the dashboard. The readout must hold up in all of them: no label over
  another, nothing cut off at the ends of the bar, every card the same
  height as its neighbours.
*/
const DRIFT_CASES_BPS = [-5000, -4796, -250, 0, 190, 250, 5000];

const percent = (bps: number) => `${bps > 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;

function DriftCases({ title, cases }: { title: string; cases: Array<{ driftBps: number; bandBps: number; targetBps?: number }> }) {
  return (
    <Screen>
      <ScreenHeader title={title}>
        Mock readings for checking the drift readout. Not a screen of the app.
      </ScreenHeader>
      {cases.map(({ driftBps, bandBps, targetBps = 5000 }) => (
        <Card key={`${driftBps}/${bandBps}/${targetBps}`} className="flex flex-col gap-5" data-drift-case="">
          <p className="ot-caps">
            Drift {percent(driftBps)} · band {(bandBps / 100).toFixed(2)}%
          </p>
          {/* As the check would have it: called for only when below target by more than the band. */}
          <AllocationPanel
            result={valuedResult(targetBps + driftBps, 1284.5, { targetBuyWeightBps: targetBps, bandThresholdBps: bandBps })}
            due={-driftBps > bandBps}
          />
        </Card>
      ))}
    </Screen>
  );
}

const driftBand = (bandBps: number) => (
  <DriftCases title={`Drift, band ${(bandBps / 100).toFixed(2)}%`} cases={DRIFT_CASES_BPS.map((driftBps) => ({ driftBps, bandBps }))} />
);

// The longest figures the readout can be asked to show: a target at either end of the range, and the widest band.
const driftLong = (
  <DriftCases
    title="Drift, longest figures"
    cases={[
      { driftBps: -10000, bandBps: 2000, targetBps: 10000 },
      { driftBps: -10000, bandBps: 10, targetBps: 10000 },
      { driftBps: 10000, bandBps: 2000, targetBps: 0 },
      { driftBps: -1999, bandBps: 2000, targetBps: 9500 },
      { driftBps: -2001, bandBps: 2000, targetBps: 9500 },
    ]}
  />
);

type SetupFixture = Partial<Parameters<typeof SetupView>[0]>;

function setup(fixture: SetupFixture) {
  return (
    <SetupView
      address={ADDRESS}
      connecting={false}
      onCreate={noop}
      onConnect={noop}
      alreadyInstalled={false}
      installedSellSymbol=""
      installedBuySymbol=""
      step="split"
      sellSymbol="XLM"
      buySymbol="USDC"
      xlmPercent={60}
      usdcPercent={40}
      onSplitSliderChange={noop}
      onSellPercentChange={noop}
      onBuyPercentChange={noop}
      advancedOpen={false}
      onToggleAdvanced={noop}
      bandPercentInput="2.00"
      onBandPercentChange={noop}
      bandError={null}
      bandRangeBps={{ min: 10, max: 2000 }}
      slippagePercentInput="1.00"
      onSlippagePercentChange={noop}
      slippageError={null}
      slippageRangeBps={{ min: 30, max: 500 }}
      cooldownValueInput="1"
      onCooldownValueChange={noop}
      cooldownUnit="hours"
      onCooldownUnitChange={noop}
      cooldownError={null}
      cooldownRangeSecs={{ min: 300, max: 604800 }}
      paramsValid
      bandThresholdBps={200}
      slippageToleranceBps={100}
      cooldownSecs={3600}
      installState={install.idle}
      onContinueToParams={noop}
      onBackToSplit={noop}
      onContinueToReview={noop}
      onBackToParams={noop}
      onAuthorize={noop}
      {...fixture}
    />
  );
}

function activity(state: HistoryState) {
  return (
    <ActivityView
      accountLabel={shorten(ADDRESS)}
      state={state}
      onRetry={noop}
      explorerAccountUrl="https://stellar.expert/explorer/testnet"
      shortenAddress={shorten}
    />
  );
}

function settings(policyState: PolicyState, revokeFixture?: { state: RevokeState; confirming?: boolean }) {
  return (
    <SettingsView
      address={ADDRESS}
      explorerAccountUrl="https://stellar.expert/explorer/testnet"
      copyButton={
        <Button size="sm" className="flex-none">
          <Icon name="copy" size={16} />
          Copy
        </Button>
      }
      policyState={policyState}
      onRetryPolicy={noop}
      revoke={
        revokeFixture ? (
          <RevokePolicyView
            state={revokeFixture.state}
            confirming={revokeFixture.confirming ?? false}
            onAskConfirm={noop}
            onCancel={noop}
            onConfirm={noop}
            onContinue={noop}
          />
        ) : null
      }
    />
  );
}

export type AppState = {
  id: string;
  label: string;
  /** Loading, empty, error, success, or an ordinary state of the screen. */
  kind: "default" | "loading" | "empty" | "error" | "success";
  /** False when the screen is shown as it is before an account connects. */
  connected?: boolean;
  render: () => ReactNode;
};

export type AppScreenEntry = {
  id: string;
  label: string;
  /** The route this screen lives at, for the sidebar's current marker. */
  href: string;
  /** Setup is a focused flow with no sidebar. */
  chrome: boolean;
  states: AppState[];
};

export const APP_SCREENS: AppScreenEntry[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/app",
    chrome: true,
    states: [
      { id: "connect", label: "Not connected", kind: "default", connected: false, render: () => <DashboardConnectView {...connect} /> },
      { id: "connect-error", label: "Passkey request cancelled", kind: "error", connected: false, render: () => <DashboardConnectView {...connect} error={CANCELLED} /> },
      { id: "connecting", label: "Creating an account", kind: "loading", connected: false, render: () => <DashboardConnectView {...connect} connecting /> },
      { id: "loading", label: "Connected, readings loading", kind: "loading", render: () => dashboard({ policy: policy.loading, balances: balances.loading }) },
      { id: "new-account", label: "New account, nothing in it yet", kind: "empty", render: () => dashboard({ policy: policy.notInstalled, balances: balances.empty }) },
      { id: "no-policy", label: "Funded, no policy yet", kind: "default", render: () => dashboard({ policy: policy.notInstalled, balances: balances.xlmOnly }) },
      { id: "within-band", label: "Policy installed, within band", kind: "default", render: () => dashboard({}) },
      { id: "scenario", label: "Scripted: balanced, drifting, rebalance", kind: "default", render: () => <DashboardScenario /> },
      { id: "prices-loading", label: "Policy installed, prices loading", kind: "loading", render: () => dashboard({ valuation: valuation.loading, rebalance: rebalance.loading }) },
      { id: "ready", label: "Past band, a rebalance is due", kind: "default", render: () => dashboard({ valuation: valuation.pastBand, rebalance: rebalance.ready }) },
      { id: "submitting", label: "Rebalance submitting", kind: "loading", render: () => dashboard({ valuation: valuation.pastBand, rebalance: rebalance.ready, trigger: trigger.submitting }) },
      { id: "submitted", label: "Rebalance submitted", kind: "success", render: () => dashboard({ valuation: valuation.withinBand, rebalance: rebalance.notDue, trigger: trigger.success }) },
      { id: "submitted-still-past-band", label: "Rebalance submitted, still past band", kind: "default", render: () => dashboard({ valuation: valuation.pastBand, rebalance: rebalance.ready, trigger: trigger.success }) },
      { id: "trigger-error", label: "Rebalance could not be submitted", kind: "error", render: () => dashboard({ valuation: valuation.pastBand, rebalance: rebalance.ready, trigger: trigger.error }) },
      { id: "cooldown", label: "Due, but inside the cooldown", kind: "default", render: () => dashboard({ valuation: valuation.pastBand, rebalance: rebalance.cooldown }) },
      { id: "pool-blocked", label: "Due, but liquidity blocks it", kind: "default", render: () => dashboard({ valuation: valuation.pastBand, rebalance: rebalance.poolBlocked }) },
      { id: "cost-exceeds", label: "Due, but not worth the cost", kind: "default", render: () => dashboard({ valuation: valuation.pastBand, rebalance: rebalance.costExceeds }) },
      { id: "above-target", label: "Above target, past the band (+2.10%)", kind: "default", render: () => dashboard({ valuation: valuation.overweight }) },
      { id: "far-past-band", label: "Far past band (-47.96%, band 2.00%)", kind: "default", render: () => dashboard({ valuation: valuation.farPastBand, rebalance: rebalance.ready }) },
      { id: "large-values", label: "Very large balances and value", kind: "default", render: () => dashboard({ valuation: valuationLarge, rebalance: rebalance.ready, balances: balancesLarge }) },
      { id: "drift-band-050", label: "Drift extremes, band 0.50%", kind: "default", render: () => driftBand(50) },
      { id: "drift-band-200", label: "Drift extremes, band 2.00%", kind: "default", render: () => driftBand(200) },
      { id: "drift-band-1000", label: "Drift extremes, band 10.00%", kind: "default", render: () => driftBand(1000) },
      { id: "drift-long", label: "Drift extremes, longest figures", kind: "default", render: () => driftLong },
      { id: "price-unavailable", label: "Live price unavailable", kind: "error", render: () => dashboard({ valuation: valuation.unavailable, rebalance: rebalance.error }) },
      { id: "network-error", label: "Network unreachable", kind: "error", render: () => dashboard({ policy: policy.error, balances: balances.error, walletError: "The account was created, but funding it with testnet XLM failed. It may need funding before it can do anything." }) },
      { id: "deposit-submitting", label: "Lira deposit in progress", kind: "loading", render: () => dashboard({ policy: policy.notInstalled, balances: balances.xlmOnly, deposit: deposit.submitting }) },
      { id: "deposit-complete", label: "Lira deposit complete", kind: "success", render: () => dashboard({ policy: policy.notInstalled, deposit: deposit.success }) },
      { id: "deposit-error", label: "Lira deposit failed", kind: "error", render: () => dashboard({ policy: policy.notInstalled, balances: balances.xlmOnly, deposit: deposit.error }) },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    href: "/app/setup",
    chrome: false,
    states: [
      { id: "connect", label: "Not connected", kind: "default", connected: false, render: () => setup({ address: null }) },
      { id: "already-installed", label: "A policy is already installed", kind: "default", render: () => setup({ alreadyInstalled: true, installedSellSymbol: "XLM", installedBuySymbol: "USDC" }) },
      { id: "split", label: "Step 1, target split", kind: "default", render: () => setup({ step: "split" }) },
      { id: "split-low", label: "Step 1, split at its lowest (5 / 95)", kind: "default", render: () => setup({ step: "split", xlmPercent: 5, usdcPercent: 95 }) },
      { id: "split-high", label: "Step 1, split at its highest (95 / 5)", kind: "default", render: () => setup({ step: "split", xlmPercent: 95, usdcPercent: 5 }) },
      { id: "params", label: "Step 2, parameters", kind: "default", render: () => setup({ step: "params" }) },
      { id: "params-advanced", label: "Step 2, advanced settings open", kind: "default", render: () => setup({ step: "params", advancedOpen: true }) },
      {
        id: "params-invalid",
        label: "Step 2, values out of range",
        kind: "error",
        render: () =>
          setup({
            step: "params",
            advancedOpen: true,
            bandPercentInput: "42",
            bandError: "Drift band must be between 0.10% and 20.00%.",
            cooldownValueInput: "",
            cooldownError: "Cooldown must be between 5 minutes and 7 days.",
            paramsValid: false,
          }),
      },
      { id: "review", label: "Step 3, review", kind: "default", render: () => setup({ step: "review" }) },
      { id: "installing", label: "Step 3, waiting for the passkey", kind: "loading", render: () => setup({ step: "review", installState: install.installing }) },
      { id: "install-error", label: "Step 3, signature cancelled", kind: "error", render: () => setup({ step: "review", installState: install.error }) },
      { id: "installed", label: "Policy installed", kind: "success", render: () => setup({ step: "review", installState: install.success }) },
    ],
  },
  {
    id: "activity",
    label: "Activity",
    href: "/app/activity",
    chrome: true,
    states: [
      { id: "connect", label: "Not connected", kind: "default", connected: false, render: () => <ActivityConnectView {...connect} /> },
      { id: "loading", label: "Reading from the chain", kind: "loading", render: () => activity(history.loading) },
      { id: "empty", label: "No rebalances yet", kind: "empty", render: () => activity(history.empty) },
      { id: "list", label: "Recent rebalances", kind: "default", render: () => activity(history.list) },
      { id: "long-figures", label: "Recent rebalances, longest figures", kind: "default", render: () => activity(historyLong) },
      { id: "error", label: "Network unreachable", kind: "error", render: () => activity(history.error) },
    ],
  },
  {
    id: "explore",
    label: "Explore",
    href: "/app/explore",
    chrome: true,
    states: [
      { id: "loading", label: "Prices loading", kind: "loading", render: () => <ExploreView assets={ASSETS} pricesState={prices.loading} /> },
      { id: "loaded", label: "Live prices", kind: "default", render: () => <ExploreView assets={ASSETS} pricesState={prices.loaded} /> },
      { id: "partial", label: "One price unavailable", kind: "empty", render: () => <ExploreView assets={ASSETS} pricesState={prices.partial} /> },
      { id: "error", label: "Oracle unreachable", kind: "error", render: () => <ExploreView assets={ASSETS} pricesState={prices.error} /> },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    href: "/app/settings",
    chrome: true,
    states: [
      { id: "connect", label: "Not connected", kind: "default", connected: false, render: () => <SettingsConnectView {...connect} /> },
      { id: "loading", label: "Policy loading", kind: "loading", render: () => settings(policy.loading) },
      { id: "no-policy", label: "No policy installed", kind: "empty", render: () => settings(policy.notInstalled) },
      { id: "installed", label: "Policy installed", kind: "default", render: () => settings(policy.installed, { state: revoke.idle }) },
      { id: "confirm", label: "Revoke, confirm step", kind: "default", render: () => settings(policy.installed, { state: revoke.idle, confirming: true }) },
      { id: "revoking", label: "Revoke, waiting for the passkey", kind: "loading", render: () => settings(policy.installed, { state: revoke.revoking }) },
      { id: "revoke-error", label: "Revoke failed", kind: "error", render: () => settings(policy.installed, { state: revoke.error }) },
      // As the real page shows it: the receipt appears while the policy
      // read still says installed, and leaves with the panel once the
      // re-read comes back empty (the "No policy installed" state above).
      { id: "revoked", label: "Policy revoked, before the policy re-read", kind: "success", render: () => settings(policy.installed, { state: revoke.success }) },
      { id: "error", label: "Network unreachable", kind: "error", render: () => settings(policy.error) },
    ],
  },
  {
    id: "asset",
    label: "Asset detail",
    href: "/app/assets/xlm",
    chrome: true,
    states: [
      {
        id: "placeholder",
        label: "Placeholder",
        kind: "empty",
        render: () => (
          <Screen>
            <ScreenHeader title="XLM">Asset detail is coming soon.</ScreenHeader>
          </Screen>
        ),
      },
    ],
  },
];

const NAV = [
  { label: "Dashboard", href: "/app" },
  { label: "Activity", href: "/app/activity" },
  { label: "Explore", href: "/app/explore" },
  { label: "Settings", href: "/app/settings" },
];

/**
 * One app screen in one state, inside the same chrome the real route has:
 * the sidebar (or top bar) for every screen but Setup, which is a focused
 * flow. The account block follows the state: connected for most, not for
 * the screens shown before an account exists.
 */
export function AppScreenPreview({ screen, state, menuOpen = false }: { screen: AppScreenEntry; state: AppState; menuOpen?: boolean }) {
  const connected = state.connected !== false;
  const account = (
    <AccountStatusView
      address={connected ? ADDRESS : null}
      addressLabel={connected ? shorten(ADDRESS) : null}
      connecting={false}
      error={null}
      onCreate={noop}
      onConnect={noop}
      onDisconnect={noop}
    />
  );

  if (!screen.chrome) {
    return (
      <Background force="app">
        <main className="min-h-screen">{state.render()}</main>
      </Background>
    );
  }

  return (
    <Background force="app">
      <div className="flex min-h-screen flex-col lg:flex-row">
      <SidebarView
        links={NAV.map((link) => ({ ...link, active: link.href === screen.href }))}
        account={account}
        menuOpen={menuOpen}
        onToggleMenu={noop}
        onCloseMenu={noop}
      />
        <main className="min-w-0 flex-1">{state.render()}</main>
      </div>
    </Background>
  );
}
