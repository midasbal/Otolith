import type { ChangeEventHandler } from "react";
import type { DepositStageEvent } from "@/components/use-deposit-try";
import { Button, ButtonLink, TextButton, TextLink } from "@/components/ui/button";
import { Card, IconWell } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon, Spinner } from "@/components/ui/icons";
import { Notice } from "@/components/ui/states";
import { explorerTxUrl } from "./common";
import type { DepositState } from "./types";

/*
  "Fund your portfolio in lira", as markup. The deposit itself, the live
  estimate, and what the amount field accepts all live in
  components/fund-in-lira.tsx; this only shows the state it is handed.

  Every label is deliberately honest about what is real (the SEP flow, the
  testnet USDC, the on-chain transactions) and what is simulated (the bank
  leg, KYC): this is a sandbox anchor, not a real bank.
*/

const STAGE_ORDER: DepositStageEvent["stage"][] = ["creating_deposit", "bank_settling", "usdc_delivered", "forwarded", "done"];

const STAGE_LABELS: Record<DepositStageEvent["stage"], string> = {
  creating_deposit: "Creating deposit",
  bank_settling: "Waiting for bank transfer (sandbox: simulated)",
  usdc_delivered: "USDC delivered",
  forwarded: "Credited to your portfolio",
  done: "Done",
};

const copy = "mt-2 text-sm leading-relaxed text-text-muted";

/** The stages a deposit reported, each with its transaction where it has one. */
function StageList({ stages, done }: { stages: DepositStageEvent[]; done: boolean }) {
  return (
    <ol className="ot-datalist">
      {stages.map((event) => (
        <li key={event.stage} className="ot-datarow flex-nowrap items-start justify-start gap-3">
          <Icon name={done ? "check" : "info"} size={18} className="mt-0.5 flex-none text-accent" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-text">{event.label}</span>
            {event.txHash ? (
              <TextLink
                href={explorerTxUrl(event.txHash)}
                target="_blank"
                rel="noreferrer"
                muted
                className="ot-num w-fit text-xs [overflow-wrap:anywhere]"
              >
                {event.txHash}
              </TextLink>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

type FundInLiraViewProps = {
  state: DepositState;
  amountTry: string;
  estimate: string | null;
  estimating: boolean;
  onAmountChange: ChangeEventHandler<HTMLInputElement>;
  onSubmit: () => void;
  onReset: () => void;
};

export function FundInLiraView({
  state,
  amountTry,
  estimate,
  estimating,
  onAmountChange,
  onSubmit,
  onReset,
}: FundInLiraViewProps) {
  if (state.status === "success") {
    return (
      <Card role="status" className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <IconWell>
            <Icon name="check" />
          </IconWell>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-medium text-text">Deposit complete</h2>
            <p className={copy}>
              {state.amountUsdc} USDC landed in your portfolio. This used the
              portfolio&rsquo;s own USDC, exchanged 1:1 for the anchor&rsquo;s
              testnet USDC (both are dollar-pegged testnet tokens; on mainnet
              the anchor delivers the canonical USDC directly and this step
              disappears).
            </p>
          </div>
        </div>
        <StageList stages={state.stages} done />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <ButtonLink href="/app/setup" native variant="primary">
            Set up or adjust rebalancing
          </ButtonLink>
          <TextButton onClick={onReset}>Make another deposit</TextButton>
        </div>
      </Card>
    );
  }

  const submitting = state.status === "submitting";

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-base font-medium text-text">Fund your portfolio in lira</h2>
        <p className={copy}>
          A real SEP-6 deposit against a Stellar testnet anchor. The bank
          transfer and identity check are simulated (this is a sandbox
          anchor, not a real bank); the Stellar side is genuine testnet
          USDC, delivered on-chain.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end">
        <Field label="Amount (TRY)">
          {(control) => (
            <Input
              {...control}
              type="text"
              inputMode="decimal"
              value={amountTry}
              onChange={onAmountChange}
              disabled={submitting}
              trailing="TRY"
            />
          )}
        </Field>
        <div className="ot-field">
          <span className="ot-label">Estimated USDC</span>
          <span className="ot-num flex min-h-[var(--control-md)] items-center truncate text-sm text-text">
            {estimating ? "..." : estimate ? `~${estimate}` : "-"}
          </span>
        </div>
      </div>

      <Button variant="primary" onClick={onSubmit} disabled={submitting} loading={submitting} className="w-fit">
        {submitting ? "Depositing..." : "Start deposit"}
      </Button>

      {submitting ? (
        <ol className="ot-datalist" aria-label="Deposit progress">
          {STAGE_ORDER.slice(0, 2).map((stage) => (
            <li key={stage} className="ot-datarow flex-nowrap items-start justify-start gap-3">
              <Spinner size={16} className="mt-0.5 flex-none text-accent" />
              <span className="min-w-0 text-sm text-text-muted">{STAGE_LABELS[stage]}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {state.status === "error" ? (
        <div className="flex flex-col items-start gap-4">
          <Notice tone="danger" role="alert" className="w-full">
            {state.message}
          </Notice>
          {state.stages.length > 0 ? (
            <div className="w-full">
              <StageList stages={state.stages} done={false} />
            </div>
          ) : null}
          <Button size="sm" onClick={onReset}>
            <Icon name="refresh" size={16} />
            Try again
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
