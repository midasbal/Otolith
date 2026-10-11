import type { ChangeEventHandler } from "react";
import { AllocationDonut } from "@/components/ui/allocation-donut";
import { Button, ButtonLink, TextLink } from "@/components/ui/button";
import { Card, IconWell } from "@/components/ui/card";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Notice } from "@/components/ui/states";
import { Stepper } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { formatBps, formatDurationSeconds } from "@/lib/stellar/format";
import { ThemeToggle } from "@/components/ui/theme";
import { ConnectPrompt, Screen, ScreenHeader, TransactionReceipt } from "./common";
import type { InstallState } from "./types";

/*
  The setup flow, as markup: choose a split, review the parameters,
  authorize. Which step is showing, every value, every validation message,
  and what happens on each press all arrive as props from
  app/app/setup/page.tsx, which owns the state and builds the policy.
*/

type Step = "split" | "params" | "review";
type DurationUnit = "minutes" | "hours" | "days";
type Range = { min: number; max: number };

const STEPS = [
  { id: "split", label: "Split" },
  { id: "params", label: "Parameters" },
  { id: "review", label: "Review" },
];

const heading = "font-display text-base font-medium text-text";
const copy = "mt-2 text-sm leading-relaxed text-text-muted";

type SetupViewProps = {
  address: string | null;
  connecting: boolean;
  onCreate: () => void;
  onConnect: () => void;

  alreadyInstalled: boolean;
  installedSellSymbol: string;
  installedBuySymbol: string;

  step: Step;
  sellSymbol: string;
  buySymbol: string;

  xlmPercent: number;
  usdcPercent: number;
  onSplitSliderChange: ChangeEventHandler<HTMLInputElement>;
  onSellPercentChange: ChangeEventHandler<HTMLInputElement>;
  onBuyPercentChange: ChangeEventHandler<HTMLInputElement>;

  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  bandPercentInput: string;
  onBandPercentChange: ChangeEventHandler<HTMLInputElement>;
  bandError: string | null;
  bandRangeBps: Range;
  slippagePercentInput: string;
  onSlippagePercentChange: ChangeEventHandler<HTMLInputElement>;
  slippageError: string | null;
  slippageRangeBps: Range;
  cooldownValueInput: string;
  onCooldownValueChange: ChangeEventHandler<HTMLInputElement>;
  cooldownUnit: DurationUnit;
  onCooldownUnitChange: ChangeEventHandler<HTMLSelectElement>;
  cooldownError: string | null;
  cooldownRangeSecs: Range;
  paramsValid: boolean;

  bandThresholdBps: number;
  slippageToleranceBps: number;
  cooldownSecs: number;

  installState: InstallState;
  onContinueToParams: () => void;
  onBackToSplit: () => void;
  onContinueToReview: () => void;
  onBackToParams: () => void;
  onAuthorize: () => void;
};

export function SetupView(props: SetupViewProps) {
  const { address, alreadyInstalled, step } = props;

  return (
    <Screen className="max-w-2xl">
      <ScreenHeader
        title="Set target weights"
        action={
          <div className="flex items-center gap-3">
            <TextLink href="/app" native className="text-sm">
              Back to dashboard
            </TextLink>
            {/* This flow has no sidebar, so the theme control sits here. */}
            <ThemeToggle />
          </div>
        }
      />

      {!address ? (
        <Card className="flex flex-col gap-5">
          <p className="text-sm leading-relaxed text-text-muted">
            This flow sets up automatic rebalancing on your own smart
            account, so it needs one connected first.
          </p>
          <ConnectPrompt
            connecting={props.connecting}
            onCreate={props.onCreate}
            onConnect={props.onConnect}
            connectLabel="Connect with your passkey"
          />
        </Card>
      ) : alreadyInstalled ? (
        <Card className="flex flex-col items-start gap-4">
          <div>
            <h2 className={heading}>A policy is already installed</h2>
            <p className={copy}>
              This account already has a rebalance policy for {props.installedSellSymbol}
              /{props.installedBuySymbol}. Changing an
              existing policy from here is not supported yet; manage it from Settings.
            </p>
          </div>
          <ButtonLink href="/app" native>
            Back to dashboard
          </ButtonLink>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Stepper label="Setup progress" steps={STEPS} current={step} className="flex w-full" />

          {step === "split" ? <SplitStep {...props} /> : null}
          {step === "params" ? <ParamsStep {...props} /> : null}
          {step === "review" ? <ReviewStep {...props} /> : null}
        </div>
      )}
    </Screen>
  );
}

function SplitStep({
  sellSymbol,
  buySymbol,
  xlmPercent,
  usdcPercent,
  onSplitSliderChange,
  onSellPercentChange,
  onBuyPercentChange,
  onContinueToParams,
}: SetupViewProps) {
  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className={heading}>Choose your target split</h2>
        <p className={copy}>
          Otolith will keep this account balanced toward this split
          between {sellSymbol} and {buySymbol}.
        </p>
      </div>

      <div className="grid items-center gap-x-8 gap-y-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        <AllocationDonut
          share={xlmPercent / 100}
          remainder
          size="8.5rem"
          label={`Target split: ${xlmPercent}% ${sellSymbol}, ${usdcPercent}% ${buySymbol}.`}
          className="mx-auto"
        >
          <div>
            <p className="ot-num text-sm text-text">
              {xlmPercent} / {usdcPercent}
            </p>
          </div>
        </AllocationDonut>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-4">
            <span className="ot-label">{sellSymbol}</span>
            <span className="ot-num text-md text-accent">{xlmPercent}%</span>
          </div>
          <Slider
            className="mt-3"
            min={0}
            max={100}
            step={1}
            value={xlmPercent}
            onChange={onSplitSliderChange}
            aria-label={`${sellSymbol} target percentage`}
          />
          <div className="mt-3 flex items-center justify-between gap-4">
            <span className="ot-label">{buySymbol}</span>
            <span className="ot-num text-md text-accent">{usdcPercent}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={`${sellSymbol} target %`}>
          {(control) => (
            <Input {...control} type="number" min={0} max={100} value={xlmPercent} onChange={onSellPercentChange} trailing="%" />
          )}
        </Field>
        <Field label={`${buySymbol} target %`}>
          {(control) => (
            <Input {...control} type="number" min={0} max={100} value={usdcPercent} onChange={onBuyPercentChange} trailing="%" />
          )}
        </Field>
      </div>

      <p className="text-sm leading-relaxed text-text-muted">
        Otolith will keep your portfolio at{" "}
        <span className="ot-num text-text">{xlmPercent}%</span> {sellSymbol} and{" "}
        <span className="ot-num text-text">{usdcPercent}%</span> {buySymbol}.
      </p>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onContinueToParams}>
          Continue
        </Button>
      </div>
    </Card>
  );
}

function ParamsStep({
  advancedOpen,
  onToggleAdvanced,
  bandPercentInput,
  onBandPercentChange,
  bandError,
  bandRangeBps,
  slippagePercentInput,
  onSlippagePercentChange,
  slippageError,
  slippageRangeBps,
  cooldownValueInput,
  onCooldownValueChange,
  cooldownUnit,
  onCooldownUnitChange,
  cooldownError,
  cooldownRangeSecs,
  paramsValid,
  onBackToSplit,
  onContinueToReview,
}: SetupViewProps) {
  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className={heading}>Parameters</h2>
        <p className={copy}>
          Sensible protections are already in place: a drift band
          before rebalancing kicks in, a slippage tolerance, and a
          cooldown between rebalances. Continue with these, or tune
          them below.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span id="setup-advanced-label" className="ot-label">
          Advanced settings
        </span>
        <Toggle checked={advancedOpen} onClick={onToggleAdvanced} aria-labelledby="setup-advanced-label" />
      </div>

      {advancedOpen ? (
        <div className="flex flex-col gap-6">
          <Field
            label="Drift band"
            hint={
              <>
                How far the portfolio can drift from target before a rebalance is worth doing. Allowed range:{" "}
                {formatBps(bandRangeBps.min)} to {formatBps(bandRangeBps.max)}.
              </>
            }
            error={bandError}
          >
            {(control) => (
              <Input {...control} type="number" step="0.01" value={bandPercentInput} onChange={onBandPercentChange} trailing="%" />
            )}
          </Field>

          <Field
            label="Slippage tolerance"
            hint={
              <>
                The most price impact a single rebalance trade is allowed to accept. Allowed range:{" "}
                {formatBps(slippageRangeBps.min)} to {formatBps(slippageRangeBps.max)}.
              </>
            }
            error={slippageError}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                step="0.01"
                value={slippagePercentInput}
                onChange={onSlippagePercentChange}
                trailing="%"
              />
            )}
          </Field>

          <Field
            label="Cooldown"
            hint={
              <>
                The minimum time between rebalances. Allowed range:{" "}
                {formatDurationSeconds(cooldownRangeSecs.min)} to {formatDurationSeconds(cooldownRangeSecs.max)}.
              </>
            }
            error={cooldownError}
          >
            {(control) => (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] gap-3">
                <Input {...control} type="number" value={cooldownValueInput} onChange={onCooldownValueChange} />
                <Select value={cooldownUnit} onChange={onCooldownUnitChange} aria-label="Cooldown unit">
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </Select>
              </div>
            )}
          </Field>
        </div>
      ) : null}

      <div className="flex justify-between gap-4">
        <Button onClick={onBackToSplit}>Back</Button>
        <Button variant="primary" onClick={onContinueToReview} disabled={!paramsValid}>
          Continue
        </Button>
      </div>
    </Card>
  );
}

function ReviewStep({
  sellSymbol,
  buySymbol,
  xlmPercent,
  usdcPercent,
  bandThresholdBps,
  slippageToleranceBps,
  cooldownSecs,
  paramsValid,
  installState,
  onBackToParams,
  onAuthorize,
}: SetupViewProps) {
  if (installState.status === "success") {
    return (
      <Card role="status" className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <IconWell>
            <Icon name="check" />
          </IconWell>
          <div className="min-w-0 flex-1">
            <h2 className={heading}>Policy installed</h2>
            <p className={copy}>
              Your portfolio is now set to rebalance toward this
              target automatically, within the bounds you chose.
            </p>
          </div>
        </div>
        <TransactionReceipt hash={installState.hash} />
        <ButtonLink href="/app" native variant="primary" className="w-fit">
          Go to dashboard
        </ButtonLink>
      </Card>
    );
  }

  const installing = installState.status === "installing";

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className={heading}>Review and authorize</h2>
        <p className={copy}>
          This installs a standing rule on your smart account.
          Anyone can trigger a rebalance of this {sellSymbol}/{buySymbol} portfolio
          toward your target, but only within the bounds below.
          It can never move funds anywhere else, and your funds
          never leave this account. You can revoke it at any
          time from Settings.
        </p>
      </div>

      <DataList>
        <DataRow label="Target split">
          {xlmPercent}% {sellSymbol} / {usdcPercent}% {buySymbol}
        </DataRow>
        <DataRow label="Drift band">{formatBps(bandThresholdBps)}</DataRow>
        <DataRow label="Slippage tolerance">{formatBps(slippageToleranceBps)}</DataRow>
        <DataRow label="Cooldown" numeric={false}>
          {formatDurationSeconds(cooldownSecs)}
        </DataRow>
      </DataList>

      {installState.status === "error" ? (
        <Notice tone="danger" role="alert">
          {installState.message}
        </Notice>
      ) : null}

      <div className="flex flex-wrap justify-between gap-4">
        <Button onClick={onBackToParams} disabled={installing}>
          Back
        </Button>
        <Button variant="primary" onClick={onAuthorize} disabled={installing || !paramsValid} loading={installing}>
          {installing ? "Waiting for passkey..." : "Authorize and sign"}
        </Button>
      </div>
      <p className="text-sm text-text-muted">One signature, no fee to you.</p>
    </Card>
  );
}
