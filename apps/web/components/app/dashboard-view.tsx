import type { ReactNode } from "react";
import { AllocationDonut } from "@/components/ui/allocation-donut";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, TextLink } from "@/components/ui/button";
import { Card, IconWell } from "@/components/ui/card";
import { DriftGauge } from "@/components/ui/drift-gauge";
import { Icon, type IconName } from "@/components/ui/icons";
import { EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/states";
import { formatBalanceAmount, formatBps, formatUsd } from "@/lib/stellar/format";
import { ConnectPrompt, PolicyTermsList, Screen, ScreenHeader, TransactionReceipt } from "./common";
import { Logo } from "@/components/ui/mark";
import { PortfolioField, rebalanceDue } from "./portfolio-field";
import type { BalancesState, PolicyState, PolicyTerms, RebalanceState, TriggerState, ValuationState } from "./types";

/*
  The dashboard, as markup. Every reading and every handler arrives as a
  prop from app/app/page.tsx, which owns the hooks; nothing here fetches,
  signs, or submits.
*/

function formatDriftBps(bps: number): string {
  const sign = bps > 0 ? "+" : bps < 0 ? "" : "±";
  return `${sign}${(bps / 100).toFixed(2)}%`;
}

// The rebalancer only ever sells sell_asset for buy_asset (v1's fixed
// one-directional design), so "overweight" the buy asset is called out
// on its own here rather than folded into "within band": it never
// implies a rebalance could be pending, in either direction the panel
// below this one might otherwise seem to echo.
function driftStatusCopy(bandState: "within_band" | "past_band" | "overweight", buySymbol: string): string {
  if (bandState === "overweight") {
    return `Holding more ${buySymbol} than target. Otolith only ever moves toward ${buySymbol}, not away from it, so this does not trigger a rebalance.`;
  }
  if (bandState === "past_band") {
    return "Past your target band. See the rebalance status below for what happens next.";
  }
  return "Within your target band. No rebalance is currently indicated.";
}

type Valued = Extract<Extract<ValuationState, { status: "loaded" }>["result"], { kind: "valued" }>;

const BAND_LABEL: Record<Valued["bandState"], string> = {
  within_band: "Within band",
  past_band: "Past band",
  overweight: "Above target",
};

type ConnectProps = {
  connecting: boolean;
  error: string | null;
  onCreate: () => void;
  onConnect: () => void;
};

/** The dashboard before an account is connected. */
export function DashboardConnectView({ connecting, error, onCreate, onConnect }: ConnectProps) {
  return (
    <Screen>
      <ScreenHeader title="Dashboard">
        Otolith holds your funds in your own smart account, secured by a
        passkey instead of a password. Create one to get started, or
        connect with a passkey you already have.
      </ScreenHeader>
      <ConnectPrompt connecting={connecting} error={error} onCreate={onCreate} onConnect={onConnect} />
    </Screen>
  );
}

/**
 * Allocation now against target, and drift against the band. `due` is
 * whether the rebalance check calls for a rebalance (see rebalanceDue):
 * the badge takes the drift color only then, the same moment the
 * background does. (Exported for the gallery's extreme cases.)
 */
export function AllocationPanel({ result, due }: { result: Valued; due: boolean }) {
  const sellSymbol = result.sellAsset.code;
  const buySymbol = result.buyAsset.code;
  const sellNowBps = 10000 - result.currentBuyWeightBps;
  const sellTargetBps = 10000 - result.targetBuyWeightBps;
  // Exactly on target counts as within the band here, not as holding more than target.
  const bandState = result.driftBps === 0 ? "within_band" : result.bandState;
  const flagged = due && bandState === "past_band";

  return (
    <div className="grid items-center gap-x-8 gap-y-6 sm:grid-cols-[auto_minmax(0,1fr)]">
      <AllocationDonut
        share={sellNowBps / 10000}
        target={sellTargetBps / 10000}
        remainder
        label={`Holding ${formatBps(sellNowBps)} ${sellSymbol} and ${formatBps(result.currentBuyWeightBps)} ${buySymbol}, against a target of ${formatBps(sellTargetBps)} ${sellSymbol} and ${formatBps(result.targetBuyWeightBps)} ${buySymbol}.`}
        className="mx-auto"
      >
        <div>
          <p className="ot-num text-sm text-text">
            {(sellNowBps / 100).toFixed(1)} / {(result.currentBuyWeightBps / 100).toFixed(1)}
          </p>
          <p className="ot-caps">
            {sellSymbol} / {buySymbol}
          </p>
        </div>
      </AllocationDonut>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="ot-label">Drift</span>
          {/* Marked only while a rebalance is called for; above target, however far, it stays neutral. */}
          <Badge dot={flagged} tone={flagged ? "drift" : undefined}>
            {BAND_LABEL[bandState]}
          </Badge>
        </div>
        <p className="ot-num mt-1 text-lg text-text">{formatDriftBps(result.driftBps)}</p>
        <DriftGauge
          value={result.driftBps}
          notches={[{ at: -result.bandThresholdBps, label: `-${formatBps(result.bandThresholdBps)}` }]}
          label={`Drift is ${formatDriftBps(result.driftBps)} of ${buySymbol} against target. A rebalance becomes due past -${formatBps(result.bandThresholdBps)}.`}
          className="mt-2"
        />
        <p className="mt-3 text-sm text-text-muted">
          Current {formatBps(result.currentBuyWeightBps)} {buySymbol} / Target{" "}
          {formatBps(result.targetBuyWeightBps)} {buySymbol}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          {driftStatusCopy(bandState, buySymbol)}
        </p>
      </div>
    </div>
  );
}

function PortfolioCard({ terms, valuationState, due }: { terms: PolicyTerms; valuationState: ValuationState; due: boolean }) {
  const valued =
    valuationState.status === "loaded" && valuationState.result.kind === "valued" ? valuationState.result : null;

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <p className="ot-caps">Portfolio value</p>

        {valuationState.status === "idle" || valuationState.status === "loading" ? (
          <LoadingState className="mt-3">Reading live prices...</LoadingState>
        ) : null}

        {valuationState.status === "error" ? (
          <Notice tone="danger" role="alert" className="mt-3">
            {valuationState.message}
          </Notice>
        ) : null}

        {valuationState.status === "loaded" && valuationState.result.kind === "unavailable" ? (
          <Notice className="mt-3">Live value is not available right now. {valuationState.result.reason}</Notice>
        ) : null}

        {valued ? (
          <>
            <p className="ot-num mt-2 text-instrument text-text [overflow-wrap:anywhere]">
              ${formatUsd(valued.totalUsdValue)}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Priced from the same live oracle the contracts use, not a market quote.
            </p>
          </>
        ) : null}
      </div>

      {valued ? (
        <>
          <div className="ot-divider" />
          <AllocationPanel result={valued} due={due} />
        </>
      ) : null}

      <div className="ot-divider" />

      <div>
        <p className="ot-caps">Your policy</p>
        <PolicyTermsList terms={terms} className="mt-2" />
      </div>

      <TextLink href="/app/settings" native className="w-fit text-sm">
        Manage or revoke this policy in Settings
      </TextLink>
    </Card>
  );
}

/** One of the rebalance card's states: an icon, a title, what it means. */
function RebalanceCard({
  icon,
  title,
  children,
  role,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  role?: "status";
}) {
  return (
    <Card role={role} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
      <IconWell>
        <Icon name={icon} />
      </IconWell>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base font-medium text-text">{title}</h2>
        {children}
      </div>
    </Card>
  );
}

const cardCopy = "mt-2 text-sm leading-relaxed text-text-muted";

type DashboardViewProps = {
  /** The connected address, shortened for display. */
  accountLabel: string;
  walletError: string | null;
  /** The funding panel (the lira on-ramp). */
  fund: ReactNode;
  policyState: PolicyState;
  valuationState: ValuationState;
  rebalanceState: RebalanceState;
  triggerState: TriggerState;
  balancesState: BalancesState;
  policyInstalled: boolean;
  onRetryPolicy: () => void;
  onRetryBalances: () => void;
  onRetryRebalanceCheck: () => void;
  onTrigger: () => void;
};

export function DashboardView({
  accountLabel,
  walletError,
  fund,
  policyState,
  valuationState,
  rebalanceState,
  triggerState,
  balancesState,
  policyInstalled,
  onRetryPolicy,
  onRetryBalances,
  onRetryRebalanceCheck,
  onTrigger,
}: DashboardViewProps) {
  return (
    <Screen>
      <PortfolioField rebalanceState={rebalanceState} triggerState={triggerState} valuationState={valuationState} />
      {/* Beside the title, the box the dashboard keeps for the scene: the logo, small, its two halves as full as
          the portfolio is of each asset. Decorative: everything it shows is in the figures and badges below. */}
      <ScreenHeader
        title="Dashboard"
        action={
          <div aria-hidden="true" data-stage="" className="ot-stage ot-stage-app">
            <Logo />
          </div>
        }
      >
        Connected as <span className="ot-num text-text">{accountLabel}</span>.
      </ScreenHeader>

      {walletError ? (
        <Notice tone="danger" role="alert" className="max-w-xl">
          {walletError}
        </Notice>
      ) : null}

      <div className="min-w-0">{fund}</div>

      <section aria-label="Portfolio" className="min-w-0">
        {policyState.status === "loading" ? <LoadingState>Checking your portfolio setup...</LoadingState> : null}

        {policyState.status === "error" ? <ErrorState message={policyState.message} onRetry={onRetryPolicy} /> : null}

        {policyState.status === "loaded" && policyState.result.kind === "not-installed" ? (
          <Card className="flex flex-col items-start gap-4">
            <div>
              <h2 className="font-display text-base font-medium text-text">Set up your portfolio</h2>
              {/* Both reasons read the same to the user (see
                  lib/stellar/policy.ts for why "params-unavailable" is
                  genuinely ambiguous, not necessarily never-installed):
                  either way, there is no active policy right now. */}
              <p className={cardCopy}>
                Choose how your portfolio should be balanced, and Otolith
                keeps your holdings aligned to it automatically. One setup
                step, fully in your control.
              </p>
            </div>
            <ButtonLink href="/app/setup" native variant="primary">
              Choose your targets
            </ButtonLink>
          </Card>
        ) : null}

        {policyState.status === "loaded" && policyState.result.kind === "installed" ? (
          <PortfolioCard terms={policyState.result.params} valuationState={valuationState} due={rebalanceDue(rebalanceState)} />
        ) : null}
      </section>

      {policyInstalled ? (
        <section aria-label="Rebalance" className="min-w-0">
          {triggerState.status === "success" ? (
            <RebalanceCard icon="check" title="Rebalance submitted" role="status">
              <p className={cardCopy}>
                Otolith&rsquo;s keeper submitted the rebalance on this account&rsquo;s behalf. No signature was needed from you.
              </p>
              <TransactionReceipt hash={triggerState.hash} className="mt-4" />
            </RebalanceCard>
          ) : (
            <>
              {rebalanceState.status === "loading" ? (
                <LoadingState>Checking whether a rebalance is due...</LoadingState>
              ) : null}

              {rebalanceState.status === "error" ? (
                <ErrorState message={rebalanceState.message} onRetry={onRetryRebalanceCheck} />
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "not_due" && rebalanceState.result.reason === "CostExceedsBenefit" ? (
                <RebalanceCard icon="info" title="Rebalance">
                  <p className={cardCopy}>
                    This rebalance would cost more than it is worth right now, so Otolith is holding off. It will rebalance once the benefit clears the cost.
                  </p>
                </RebalanceCard>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "not_due" && rebalanceState.result.reason !== "CostExceedsBenefit" ? (
                <RebalanceCard icon="check" title="Rebalance">
                  <p className={cardCopy}>
                    Your portfolio is within its target band. No rebalance is needed right now.
                  </p>
                </RebalanceCard>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "cooldown" ? (
                <RebalanceCard icon="info" title="Rebalance">
                  <p className={cardCopy}>
                    A rebalance happened recently. The next one becomes available again shortly, once the configured cooldown has passed.
                  </p>
                </RebalanceCard>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "pool_blocked" ? (
                <RebalanceCard icon="shield" title="Rebalance">
                  <p className={cardCopy}>
                    Your portfolio has drifted enough to rebalance, but current market liquidity for this pair cannot support the trade safely right now. Otolith will not execute a trade that would lose value to a bad price.
                  </p>
                </RebalanceCard>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "ready" ? (
                <RebalanceCard icon="broadcast" title="A rebalance is due">
                  <p className={cardCopy}>
                    Rebalancing is permissionless: anyone can submit it, no owner signature is required. Otolith&rsquo;s keeper can submit it now, as a convenience. Your funds never leave this account regardless of who triggers it.
                  </p>
                  <Button
                    variant="primary"
                    onClick={onTrigger}
                    disabled={triggerState.status === "submitting"}
                    loading={triggerState.status === "submitting"}
                    className="mt-4"
                  >
                    {triggerState.status === "submitting" ? "Submitting..." : "Rebalance now"}
                  </Button>
                  {triggerState.status === "error" ? (
                    <Notice tone="danger" role="alert" className="mt-4">
                      {triggerState.message}
                    </Notice>
                  ) : null}
                </RebalanceCard>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <section aria-label="Balances" className="min-w-0">
        {balancesState.status === "idle" || balancesState.status === "loading" ? (
          <LoadingState>Loading balances...</LoadingState>
        ) : null}

        {balancesState.status === "error" ? (
          <ErrorState message={balancesState.message} onRetry={onRetryBalances} />
        ) : null}

        {balancesState.status === "loaded" && balancesState.result.kind === "empty" ? (
          <EmptyState icon="wallet">
            This account has no balances yet. It may still be funding, or
            it needs testnet XLM to get started.
          </EmptyState>
        ) : null}

        {balancesState.status === "loaded" && balancesState.result.kind === "funded" ? (
          <Card>
            <table className="ot-table">
              <caption className="ot-caps pb-3 text-left">Balances</caption>
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col" data-numeric>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {balancesState.result.balances.map((asset) => (
                  <tr key={asset.contract}>
                    <td>{asset.code}</td>
                    <td data-numeric>{formatBalanceAmount(asset.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </section>
    </Screen>
  );
}
