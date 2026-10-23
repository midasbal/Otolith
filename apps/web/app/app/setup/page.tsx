"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { usePolicyStatus } from "@/components/use-policy-status";
import { useInstallPolicy } from "@/components/use-install-policy";
import { SetupView } from "@/components/app/setup-view";
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
    <SetupView
      address={address}
      connecting={connecting}
      onCreate={() => void createWallet()}
      onConnect={() => void connectWallet()}
      alreadyInstalled={alreadyInstalled}
      installedSellSymbol={policyState.status === "loaded" && policyState.result.kind === "installed" ? policyState.result.params.sellSymbol : ""}
      installedBuySymbol={policyState.status === "loaded" && policyState.result.kind === "installed" ? policyState.result.params.buySymbol : ""}
      step={step}
      sellSymbol={SELL_ASSET.symbol}
      buySymbol={BUY_ASSET.symbol}
      xlmPercent={xlmPercent}
      usdcPercent={usdcPercent}
      onSplitSliderChange={(e) => setXlmPercent(clampPercent(Number(e.target.value)))}
      onSellPercentChange={(e) => setXlmPercent(clampPercent(Number(e.target.value)))}
      onBuyPercentChange={(e) => setXlmPercent(clampPercent(100 - Number(e.target.value)))}
      advancedOpen={advancedOpen}
      onToggleAdvanced={() => setAdvancedOpen((open) => !open)}
      bandPercentInput={bandPercentInput}
      onBandPercentChange={(e) => setBandPercentInput(e.target.value)}
      bandError={bandError}
      bandRangeBps={BAND_THRESHOLD_BPS_RANGE}
      slippagePercentInput={slippagePercentInput}
      onSlippagePercentChange={(e) => setSlippagePercentInput(e.target.value)}
      slippageError={slippageError}
      slippageRangeBps={SLIPPAGE_TOLERANCE_BPS_RANGE}
      cooldownValueInput={cooldownValueInput}
      onCooldownValueChange={(e) => setCooldownValueInput(e.target.value)}
      cooldownUnit={cooldownUnit}
      onCooldownUnitChange={(e) => setCooldownUnit(e.target.value as DurationUnit)}
      cooldownError={cooldownError}
      cooldownRangeSecs={COOLDOWN_SECS_RANGE}
      paramsValid={paramsValid}
      bandThresholdBps={bandThresholdBps}
      slippageToleranceBps={slippageToleranceBps}
      cooldownSecs={cooldownSecs}
      installState={installState}
      onContinueToParams={() => setStep("params")}
      onBackToSplit={() => setStep("split")}
      onContinueToReview={() => setStep("review")}
      onBackToParams={() => setStep("params")}
      onAuthorize={() => void install(installParams, "Rebalance policy")}
    />
  );
}
