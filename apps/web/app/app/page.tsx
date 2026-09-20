"use client";

import { useMemo } from "react";
import { truncateAddress, useWallet } from "@/components/wallet-provider";
import { useSmartAccountBalances } from "@/components/use-smart-account-balances";
import { usePolicyStatus } from "@/components/use-policy-status";
import { useRebalanceCheck } from "@/components/use-rebalance-check";
import { useTriggerRebalance } from "@/components/use-trigger-rebalance";
import { usePortfolioValuation, type PortfolioValuationInput } from "@/components/use-portfolio-value";
import { FundInLira } from "@/components/fund-in-lira";
import { formatBalanceAmount, formatBps, formatDurationSeconds, formatUsd, type ExtraTokenContract } from "@/lib/stellar";
import { BUY_ASSET } from "@/lib/stellar/policy-config";

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

const secondaryButtonClass =
  "mt-4 inline-flex w-fit items-center justify-center rounded-md border border-panel-border px-3 py-1.5 text-xs font-medium text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)]";

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
      <div className="mx-auto flex max-w-3xl flex-col px-6 py-16 sm:px-10">
        <h1 className="font-display text-2xl font-medium tracking-tight text-text">
          Dashboard
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
          Otolith holds your funds in your own smart account, secured by a
          passkey instead of a password. Create one to get started, or
          connect with a passkey you already have.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => void createWallet()}
            disabled={connecting}
            className="inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-surface-raised)] px-6 py-3 text-sm font-medium text-[var(--color-surface)] transition-[transform,background-color] duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:-translate-y-0.5 hover:bg-[var(--color-surface-raised-hover)] disabled:opacity-60 motion-reduce:hover:translate-y-0"
          >
            {connecting ? "Working..." : "Create account"}
          </button>
          <button
            type="button"
            onClick={() => void connectWallet()}
            disabled={connecting}
            className="text-sm text-text-muted underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-text disabled:opacity-60"
          >
            Have an account already? Connect with your passkey
          </button>
        </div>

        {error ? (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-faint">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-6 py-16 sm:px-10">
      <h1 className="font-display text-2xl font-medium tracking-tight text-text">
        Dashboard
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
        Connected as{" "}
        <span className="font-mono text-text">
          {truncateAddress(address)}
        </span>
        .
      </p>

      {error ? (
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-faint">
          {error}
        </p>
      ) : null}

      <div className="mt-8 min-w-0">
        <FundInLira account={address} onDeposited={retryBalances} />
      </div>

      <div className="mt-8 min-w-0">
        {policyState.status === "loading" ? (
          <p className="text-sm text-text-muted">Checking your portfolio setup...</p>
        ) : null}

        {policyState.status === "error" ? (
          <div className="panel min-w-0 rounded-lg p-6">
            <p className="text-sm leading-relaxed text-panel-text/70">
              {policyState.message}
            </p>
            <button
              type="button"
              onClick={retryPolicy}
              className="mt-4 rounded-md border border-panel-border px-3 py-1.5 text-xs font-medium text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)]"
            >
              Retry
            </button>
          </div>
        ) : null}

        {policyState.status === "loaded" && policyState.result.kind === "not-installed" ? (
          <div className="panel min-w-0 rounded-lg p-6">
            <h2 className="font-display text-base font-medium text-panel-text">
              Set up your portfolio
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
              {/* Both reasons read the same to the user (see
                  lib/stellar/policy.ts for why "params-unavailable" is
                  genuinely ambiguous, not necessarily never-installed):
                  either way, there is no active policy right now. */}
              Choose how your portfolio should be balanced, and Otolith
              keeps your holdings aligned to it automatically. One setup
              step, fully in your control.
            </p>
            <a
              href="/app/setup"
              className="mt-4 inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:bg-[var(--color-accent-deep)]"
            >
              Choose your targets
            </a>
          </div>
        ) : null}

        {policyState.status === "loaded" && policyState.result.kind === "installed" ? (
          <div className="panel min-w-0 rounded-lg p-6">
            <p className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
              Portfolio value
            </p>

            {valuationState.status === "idle" || valuationState.status === "loading" ? (
              <p className="mt-3 text-sm text-panel-text/60">Reading live prices...</p>
            ) : null}

            {valuationState.status === "error" ? (
              <p className="mt-3 text-sm leading-relaxed text-panel-text/60">
                {valuationState.message}
              </p>
            ) : null}

            {valuationState.status === "loaded" && valuationState.result.kind === "unavailable" ? (
              <p className="mt-3 text-sm leading-relaxed text-panel-text/60">
                Live value is not available right now. {valuationState.result.reason}
              </p>
            ) : null}

            {valuationState.status === "loaded" && valuationState.result.kind === "valued" ? (
              <>
                <p className="mt-2 font-mono text-instrument tabular-nums text-panel-text">
                  ${formatUsd(valuationState.result.totalUsdValue)}
                </p>
                <p className="mt-1 text-xs text-panel-text/50">
                  Priced from the same live oracle the contracts use, not a market quote.
                </p>

                <div className="mt-5 flex flex-col gap-1.5 border-t border-panel-border pt-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-panel-text">Drift</span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-panel-text">
                      {formatDriftBps(valuationState.result.driftBps)}
                    </span>
                  </div>
                  <p className="text-xs text-panel-text/60">
                    Current {formatBps(valuationState.result.currentBuyWeightBps)} {valuationState.result.buyAsset.code} / Target{" "}
                    {formatBps(valuationState.result.targetBuyWeightBps)} {valuationState.result.buyAsset.code}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-panel-text/70">
                    {driftStatusCopy(valuationState.result.bandState, valuationState.result.buyAsset.code)}
                  </p>
                </div>
              </>
            ) : null}

            <p className="mt-6 text-xs uppercase tracking-[0.14em] text-panel-text/60">
              Your policy
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-panel-border">
              <li className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0 truncate text-sm text-panel-text">
                  Target allocation
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-panel-text">
                  {formatBps(10000 - policyState.result.params.targetBuyWeightBps)} {policyState.result.params.sellSymbol} /{" "}
                  {formatBps(policyState.result.params.targetBuyWeightBps)} {policyState.result.params.buySymbol}
                </span>
              </li>
              <li className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0 truncate text-sm text-panel-text">
                  Drift band
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-panel-text">
                  {formatBps(policyState.result.params.bandThresholdBps)}
                </span>
              </li>
              <li className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0 truncate text-sm text-panel-text">
                  Slippage tolerance
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-panel-text">
                  {formatBps(policyState.result.params.slippageToleranceBps)}
                </span>
              </li>
              <li className="flex items-center justify-between gap-4 py-2.5">
                <span className="min-w-0 truncate text-sm text-panel-text">
                  Cooldown
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-panel-text">
                  {formatDurationSeconds(policyState.result.params.cooldownSecs)}
                </span>
              </li>
            </ul>

            <div className="mt-6 border-t border-panel-border pt-4">
              <a
                href="/app/settings"
                className="text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text"
              >
                Manage or revoke this policy in Settings
              </a>
            </div>
          </div>
        ) : null}
      </div>

      {policyInstalled ? (
        <div className="mt-8 min-w-0">
          {triggerState.status === "success" ? (
            <div className="panel min-w-0 rounded-lg p-6">
              <h2 className="font-display text-base font-medium text-panel-text">
                Rebalance submitted
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                Otolith&rsquo;s keeper submitted the rebalance on this account&rsquo;s behalf. No signature was needed from you.
              </p>
              <p className="mt-4 text-xs text-panel-text/60">Transaction hash</p>
              <p className="mt-1 break-all font-mono text-sm text-panel-text">{triggerState.hash}</p>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${triggerState.hash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text"
              >
                View on stellar.expert
              </a>
            </div>
          ) : (
            <>
              {rebalanceState.status === "loading" ? (
                <p className="text-sm text-text-muted">Checking whether a rebalance is due...</p>
              ) : null}

              {rebalanceState.status === "error" ? (
                <div className="panel min-w-0 rounded-lg p-6">
                  <p className="text-sm leading-relaxed text-panel-text/70">
                    {rebalanceState.message}
                  </p>
                  <button type="button" onClick={retryRebalanceCheck} className={secondaryButtonClass}>
                    Retry
                  </button>
                </div>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "not_due" && rebalanceState.result.reason === "CostExceedsBenefit" ? (
                <div className="panel min-w-0 rounded-lg p-6">
                  <h2 className="font-display text-base font-medium text-panel-text">
                    Rebalance
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                    This rebalance would cost more than it is worth right now, so Otolith is holding off. It will rebalance once the benefit clears the cost.
                  </p>
                </div>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "not_due" && rebalanceState.result.reason !== "CostExceedsBenefit" ? (
                <div className="panel min-w-0 rounded-lg p-6">
                  <h2 className="font-display text-base font-medium text-panel-text">
                    Rebalance
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                    Your portfolio is within its target band. No rebalance is needed right now.
                  </p>
                </div>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "cooldown" ? (
                <div className="panel min-w-0 rounded-lg p-6">
                  <h2 className="font-display text-base font-medium text-panel-text">
                    Rebalance
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                    A rebalance happened recently. The next one becomes available again shortly, once the configured cooldown has passed.
                  </p>
                </div>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "pool_blocked" ? (
                <div className="panel min-w-0 rounded-lg p-6">
                  <h2 className="font-display text-base font-medium text-panel-text">
                    Rebalance
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                    Your portfolio has drifted enough to rebalance, but current market liquidity for this pair cannot support the trade safely right now. Otolith will not execute a trade that would lose value to a bad price.
                  </p>
                </div>
              ) : null}

              {rebalanceState.status === "loaded" && rebalanceState.result.state === "ready" ? (
                <div className="panel min-w-0 rounded-lg p-6">
                  <h2 className="font-display text-base font-medium text-panel-text">
                    A rebalance is due
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                    Rebalancing is permissionless: anyone can submit it, no owner signature is required. Otolith&rsquo;s keeper can submit it now, as a convenience. Your funds never leave this account regardless of who triggers it.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleTrigger()}
                    disabled={triggerState.status === "submitting"}
                    className="mt-4 inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:bg-[var(--color-accent-deep)] disabled:pointer-events-none disabled:opacity-60"
                  >
                    {triggerState.status === "submitting" ? "Submitting..." : "Rebalance now"}
                  </button>
                  {triggerState.status === "error" ? (
                    <p className="mt-3 text-sm leading-relaxed text-text-faint">{triggerState.message}</p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="mt-8 min-w-0">
        {balancesState.status === "idle" || balancesState.status === "loading" ? (
          <p className="text-sm text-text-muted">Loading balances...</p>
        ) : null}

        {balancesState.status === "error" ? (
          <div className="panel min-w-0 rounded-lg p-6">
            <p className="text-sm leading-relaxed text-panel-text/70">
              {balancesState.message}
            </p>
            <button
              type="button"
              onClick={retryBalances}
              className="mt-4 rounded-md border border-panel-border px-3 py-1.5 text-xs font-medium text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)]"
            >
              Retry
            </button>
          </div>
        ) : null}

        {balancesState.status === "loaded" && balancesState.result.kind === "empty" ? (
          <div className="panel min-w-0 rounded-lg p-6">
            <p className="text-sm leading-relaxed text-panel-text/70">
              This account has no balances yet. It may still be funding, or
              it needs testnet XLM to get started.
            </p>
          </div>
        ) : null}

        {balancesState.status === "loaded" && balancesState.result.kind === "funded" ? (
          <div className="panel min-w-0 rounded-lg p-6">
            <p className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
              Balances
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-panel-border">
              {balancesState.result.balances.map((asset) => (
                <li
                  key={asset.contract}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-panel-text">
                    {asset.code}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-panel-text">
                    {formatBalanceAmount(asset.balance)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
