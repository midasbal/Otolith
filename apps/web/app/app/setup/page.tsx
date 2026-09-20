"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { usePolicyStatus } from "@/components/use-policy-status";
import { useInstallPolicy } from "@/components/use-install-policy";
import { formatDurationSeconds } from "@/lib/stellar";
import {
  BAND_THRESHOLD_BPS_RANGE,
  BUY_ASSET,
  COOLDOWN_SECS_RANGE,
  FIXED_PARAM_DEFAULTS,
  ORACLE,
  ROUTER,
  SELL_ASSET,
  SLIPPAGE_TOLERANCE_BPS_RANGE,
} from "@/lib/stellar/policy-config";

type Step = "split" | "params" | "review";

type DurationUnit = "minutes" | "hours" | "days";

const DURATION_UNIT_SECONDS: Record<DurationUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function clampPercent(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(n)));
}

// Human units everywhere on screen; raw contract units (bps, seconds)
// only when building the install params.
function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

function bpsToPercentInput(bps: number): string {
  return (bps / 100).toFixed(2);
}

function durationToSeconds(value: number, unit: DurationUnit): number {
  return Math.round(value * DURATION_UNIT_SECONDS[unit]);
}

function validatePercent(percent: number, rangeBps: { min: number; max: number }, label: string): string | null {
  if (Number.isNaN(percent)) {
    return `Enter a number for ${label}.`;
  }
  const bps = percentToBps(percent);
  if (bps < rangeBps.min || bps > rangeBps.max) {
    return `${label} must be between ${formatBps(rangeBps.min)} and ${formatBps(rangeBps.max)}.`;
  }
  return null;
}

function validateDuration(
  value: number,
  unit: DurationUnit,
  range: { min: number; max: number },
  label: string,
): string | null {
  if (Number.isNaN(value)) {
    return `Enter a number for ${label}.`;
  }
  const seconds = durationToSeconds(value, unit);
  if (seconds < range.min || seconds > range.max) {
    return `${label} must be between ${formatDurationSeconds(range.min)} and ${formatDurationSeconds(range.max)}.`;
  }
  return null;
}

const inputClass =
  "w-full rounded-md border border-panel-border bg-[var(--color-panel-recessed)] px-3 py-2 font-mono text-sm tabular-nums text-panel-text outline-none transition-colors duration-[var(--duration-fast)] focus:border-[var(--color-accent)]";

const primaryButtonClass =
  "inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-text transition-[transform,background-color] duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:-translate-y-0.5 hover:bg-[var(--color-accent-deep)] disabled:pointer-events-none disabled:opacity-60 motion-reduce:hover:translate-y-0";

const secondaryButtonClass =
  "inline-flex w-fit items-center justify-center rounded-md border border-panel-border px-4 py-2 text-sm text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)] disabled:pointer-events-none disabled:opacity-60";

export default function SetupPage() {
  const { address, connecting, createWallet, connectWallet } = useWallet();
  const { state: policyState } = usePolicyStatus(address);
  const { state: installState, install } = useInstallPolicy();

  const [step, setStep] = useState<Step>("split");

  // Single source of truth: XLM's share of the portfolio, in whole
  // percent. USDC's share is always the remainder, so the two always
  // sum to 100.
  const [xlmPercent, setXlmPercent] = useState(50);
  const usdcPercent = 100 - xlmPercent;

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bandPercentInput, setBandPercentInput] = useState(bpsToPercentInput(BAND_THRESHOLD_BPS_RANGE.default));
  const [slippagePercentInput, setSlippagePercentInput] = useState(
    bpsToPercentInput(SLIPPAGE_TOLERANCE_BPS_RANGE.default),
  );
  // Default cooldown is 3600 seconds, shown as "1 hour".
  const [cooldownValueInput, setCooldownValueInput] = useState("1");
  const [cooldownUnit, setCooldownUnit] = useState<DurationUnit>("hours");

  const bandPercent = Number(bandPercentInput);
  const slippagePercent = Number(slippagePercentInput);
  const cooldownValue = Number(cooldownValueInput);

  const bandThresholdBps = percentToBps(bandPercent);
  const slippageToleranceBps = percentToBps(slippagePercent);
  const cooldownSecs = durationToSeconds(cooldownValue, cooldownUnit);

  const bandError = validatePercent(bandPercent, BAND_THRESHOLD_BPS_RANGE, "Drift band");
  const slippageError = validatePercent(slippagePercent, SLIPPAGE_TOLERANCE_BPS_RANGE, "Slippage tolerance");
  const cooldownError = validateDuration(cooldownValue, cooldownUnit, COOLDOWN_SECS_RANGE, "Cooldown");
  const paramsValid = !bandError && !slippageError && !cooldownError;

  // USDC is the buy asset for v1, so target_buy_weight_bps (the target
  // fraction of the portfolio held in buy_asset, per the contract's own
  // definition) is exactly the USDC percentage shown on screen, in bps.
  // No inversion: whatever percent the user sees next to USDC is the
  // number sent on-chain as target_buy_weight_bps.
  const targetBuyWeightBps = usdcPercent * 100;

  const installParams = useMemo(
    () => ({
      sellAsset: SELL_ASSET.contract,
      buyAsset: BUY_ASSET.contract,
      router: ROUTER,
      oracle: ORACLE,
      sellSymbol: SELL_ASSET.symbol,
      buySymbol: BUY_ASSET.symbol,
      slippageToleranceBps,
      targetBuyWeightBps,
      bandThresholdBps,
      minTradeSize: FIXED_PARAM_DEFAULTS.minTradeSize,
      reservedTipBps: FIXED_PARAM_DEFAULTS.reservedTipBps,
      maxCostRatioBps: FIXED_PARAM_DEFAULTS.maxCostRatioBps,
      cooldownSecs,
    }),
    [slippageToleranceBps, targetBuyWeightBps, bandThresholdBps, cooldownSecs],
  );

  const alreadyInstalled = policyState.status === "loaded" && policyState.result.kind === "installed";

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-6 py-12 sm:px-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium tracking-tight text-text">
          Set target weights
        </h1>
        <a
          href="/app"
          className="text-sm text-text-muted underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-text"
        >
          Back to dashboard
        </a>
      </div>

      {!address ? (
        <div className="mt-8 panel min-w-0 rounded-lg p-6">
          <p className="text-sm leading-relaxed text-panel-text/70">
            This flow sets up automatic rebalancing on your own smart
            account, so it needs one connected first.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <button type="button" onClick={() => void createWallet()} disabled={connecting} className={primaryButtonClass}>
              {connecting ? "Working..." : "Create account"}
            </button>
            <button
              type="button"
              onClick={() => void connectWallet()}
              disabled={connecting}
              className="text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text disabled:opacity-60"
            >
              Connect with your passkey
            </button>
          </div>
        </div>
      ) : alreadyInstalled ? (
        <div className="mt-8 panel min-w-0 rounded-lg p-6">
          <h2 className="font-display text-base font-medium text-panel-text">
            A policy is already installed
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
            This account already has a rebalance policy for {policyState.result.kind === "installed" ? policyState.result.params.sellSymbol : ""}
            /{policyState.result.kind === "installed" ? policyState.result.params.buySymbol : ""}. Changing an
            existing policy from here is not supported yet; manage it from Settings.
          </p>
          <a href="/app" className={`mt-4 ${secondaryButtonClass}`}>
            Back to dashboard
          </a>
        </div>
      ) : (
        <div className="mt-8">
          <ol className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-text-faint">
            <li className={step === "split" ? "text-text" : ""}>1. Split</li>
            <li aria-hidden>&middot;</li>
            <li className={step === "params" ? "text-text" : ""}>2. Parameters</li>
            <li aria-hidden>&middot;</li>
            <li className={step === "review" ? "text-text" : ""}>3. Review</li>
          </ol>

          {step === "split" ? (
            <div className="mt-6 panel min-w-0 rounded-lg p-6">
              <h2 className="font-display text-base font-medium text-panel-text">
                Choose your target split
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                Otolith will keep this account balanced toward this split
                between {SELL_ASSET.symbol} and {BUY_ASSET.symbol}.
              </p>

              <div className="mt-6 flex items-center justify-between gap-4">
                <span className="text-sm text-panel-text">{SELL_ASSET.symbol}</span>
                <span className="font-mono text-lg tabular-nums text-[var(--color-accent)]">{xlmPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={xlmPercent}
                onChange={(e) => setXlmPercent(clampPercent(Number(e.target.value)))}
                className="mt-3 w-full accent-[var(--color-accent)]"
                aria-label={`${SELL_ASSET.symbol} target percentage`}
              />
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-sm text-panel-text">{BUY_ASSET.symbol}</span>
                <span className="font-mono text-lg tabular-nums text-[var(--color-accent)]">{usdcPercent}%</span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-panel-text/60">{SELL_ASSET.symbol} target %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={xlmPercent}
                    onChange={(e) => setXlmPercent(clampPercent(Number(e.target.value)))}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-panel-text/60">{BUY_ASSET.symbol} target %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={usdcPercent}
                    onChange={(e) => setXlmPercent(clampPercent(100 - Number(e.target.value)))}
                    className={inputClass}
                  />
                </label>
              </div>

              <p className="mt-6 text-sm leading-relaxed text-panel-text/70">
                Otolith will keep your portfolio at{" "}
                <span className="font-mono text-panel-text">{xlmPercent}%</span> {SELL_ASSET.symbol} and{" "}
                <span className="font-mono text-panel-text">{usdcPercent}%</span> {BUY_ASSET.symbol}.
              </p>

              <div className="mt-6 flex justify-end">
                <button type="button" onClick={() => setStep("params")} className={primaryButtonClass}>
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === "params" ? (
            <div className="mt-6 panel min-w-0 rounded-lg p-6">
              <h2 className="font-display text-base font-medium text-panel-text">
                Parameters
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                Sensible protections are already in place: a drift band
                before rebalancing kicks in, a slippage tolerance, and a
                cooldown between rebalances. Continue with these, or tune
                them below.
              </p>

              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
                className="mt-4 text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text"
              >
                {advancedOpen ? "Hide advanced settings" : "Advanced settings"}
              </button>

              {advancedOpen ? (
                <div className="mt-4 flex flex-col gap-5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm text-panel-text">Drift band</span>
                    <span className="text-xs text-panel-text/60">
                      How far the portfolio can drift from target before a rebalance is worth doing. Allowed range:{" "}
                      {formatBps(BAND_THRESHOLD_BPS_RANGE.min)} to {formatBps(BAND_THRESHOLD_BPS_RANGE.max)}.
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={bandPercentInput}
                        onChange={(e) => setBandPercentInput(e.target.value)}
                        className={inputClass}
                      />
                      <span className="text-sm text-panel-text/60">%</span>
                    </div>
                    {bandError ? <span className="text-xs text-text-faint">{bandError}</span> : null}
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm text-panel-text">Slippage tolerance</span>
                    <span className="text-xs text-panel-text/60">
                      The most price impact a single rebalance trade is allowed to accept. Allowed range:{" "}
                      {formatBps(SLIPPAGE_TOLERANCE_BPS_RANGE.min)} to {formatBps(SLIPPAGE_TOLERANCE_BPS_RANGE.max)}.
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={slippagePercentInput}
                        onChange={(e) => setSlippagePercentInput(e.target.value)}
                        className={inputClass}
                      />
                      <span className="text-sm text-panel-text/60">%</span>
                    </div>
                    {slippageError ? <span className="text-xs text-text-faint">{slippageError}</span> : null}
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm text-panel-text">Cooldown</span>
                    <span className="text-xs text-panel-text/60">
                      The minimum time between rebalances. Allowed range:{" "}
                      {formatDurationSeconds(COOLDOWN_SECS_RANGE.min)} to {formatDurationSeconds(COOLDOWN_SECS_RANGE.max)}.
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={cooldownValueInput}
                        onChange={(e) => setCooldownValueInput(e.target.value)}
                        className={inputClass}
                      />
                      <select
                        value={cooldownUnit}
                        onChange={(e) => setCooldownUnit(e.target.value as DurationUnit)}
                        className="rounded-md border border-panel-border bg-[var(--color-panel-recessed)] px-3 py-2 text-sm text-panel-text outline-none transition-colors duration-[var(--duration-fast)] focus:border-[var(--color-accent)]"
                      >
                        <option value="minutes">minutes</option>
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                    </div>
                    {cooldownError ? <span className="text-xs text-text-faint">{cooldownError}</span> : null}
                  </label>
                </div>
              ) : null}

              <div className="mt-6 flex justify-between">
                <button type="button" onClick={() => setStep("split")} className={secondaryButtonClass}>
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep("review")}
                  disabled={!paramsValid}
                  className={primaryButtonClass}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="mt-6 panel min-w-0 rounded-lg p-6">
              {installState.status === "success" ? (
                <>
                  <h2 className="font-display text-base font-medium text-panel-text">
                    Policy installed
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                    Your portfolio is now set to rebalance toward this
                    target automatically, within the bounds you chose.
                  </p>
                  <p className="mt-4 text-xs text-panel-text/60">Transaction hash</p>
                  <p className="mt-1 break-all font-mono text-sm text-panel-text">{installState.hash}</p>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${installState.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text"
                  >
                    View on stellar.expert
                  </a>
                  <div className="mt-6">
                    <a href="/app" className={primaryButtonClass}>
                      Go to dashboard
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="font-display text-base font-medium text-panel-text">
                    Review and authorize
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
                    This installs a standing rule on your smart account.
                    Anyone can trigger a rebalance of this {SELL_ASSET.symbol}/{BUY_ASSET.symbol} portfolio
                    toward your target, but only within the bounds below.
                    It can never move funds anywhere else, and your funds
                    never leave this account. You can revoke it at any
                    time from Settings.
                  </p>

                  <ul className="mt-5 flex flex-col divide-y divide-panel-border">
                    <li className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-sm text-panel-text">Target split</span>
                      <span className="font-mono text-sm tabular-nums text-panel-text">
                        {xlmPercent}% {SELL_ASSET.symbol} / {usdcPercent}% {BUY_ASSET.symbol}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-sm text-panel-text">Drift band</span>
                      <span className="font-mono text-sm tabular-nums text-panel-text">{formatBps(bandThresholdBps)}</span>
                    </li>
                    <li className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-sm text-panel-text">Slippage tolerance</span>
                      <span className="font-mono text-sm tabular-nums text-panel-text">{formatBps(slippageToleranceBps)}</span>
                    </li>
                    <li className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-sm text-panel-text">Cooldown</span>
                      <span className="font-mono text-sm tabular-nums text-panel-text">
                        {formatDurationSeconds(cooldownSecs)}
                      </span>
                    </li>
                  </ul>

                  {installState.status === "error" ? (
                    <p className="mt-4 text-sm leading-relaxed text-text-faint">{installState.message}</p>
                  ) : null}

                  <div className="mt-6 flex justify-between">
                    <button
                      type="button"
                      onClick={() => setStep("params")}
                      disabled={installState.status === "installing"}
                      className={secondaryButtonClass}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void install(installParams, "Rebalance policy")}
                      disabled={installState.status === "installing" || !paramsValid}
                      className={primaryButtonClass}
                    >
                      {installState.status === "installing" ? "Waiting for passkey..." : "Authorize and sign"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-panel-text/60">
                    One signature, no fee to you.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
