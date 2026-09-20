"use client";

import { useEffect, useState } from "react";
import { useDepositTry, type DepositStageEvent } from "@/components/use-deposit-try";

const secondaryButtonClass =
  "mt-4 inline-flex w-fit items-center justify-center rounded-md border border-panel-border px-3 py-1.5 text-xs font-medium text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)]";

const STAGE_ORDER: DepositStageEvent["stage"][] = ["creating_deposit", "bank_settling", "usdc_delivered", "forwarded", "done"];

const STAGE_LABELS: Record<DepositStageEvent["stage"], string> = {
  creating_deposit: "Creating deposit",
  bank_settling: "Waiting for bank transfer (sandbox: simulated)",
  usdc_delivered: "USDC delivered",
  forwarded: "Credited to your portfolio",
  done: "Done",
};

function useEstimatedUsdc(tryAmount: string): { estimate: string | null; loading: boolean } {
  const [estimate, setEstimate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const numeric = Number(tryAmount);
    const isValidAmount = Boolean(tryAmount) && Number.isFinite(numeric) && numeric > 0;

    const timeout = setTimeout(() => {
      if (cancelled) {
        return;
      }
      if (!isValidAmount) {
        setEstimate(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      fetch(`/api/deposit-try?amount=${encodeURIComponent(tryAmount)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) {
            setEstimate(typeof data.estimatedUsdc === "string" ? data.estimatedUsdc : null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setEstimate(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [tryAmount]);

  return { estimate, loading };
}

/**
 * "Fund your portfolio in lira": a real SEP-6 on-ramp against the TR mock
 * anchor (tr-mock-anchor.fly.dev), driven entirely by the server's own
 * relay key (see lib/server/anchor.ts). Every label here is deliberately
 * honest about what is real (the SEP flow, the testnet USDC, the on-chain
 * transactions) and what is simulated (the bank leg, KYC) — this is a
 * sandbox anchor, not a real bank.
 */
export function FundInLira({ account, onDeposited }: { account: string; onDeposited: () => void }) {
  const [amountTry, setAmountTry] = useState("500");
  const { estimate, loading: estimating } = useEstimatedUsdc(amountTry);
  const { state, deposit, reset } = useDepositTry();

  const handleSubmit = async () => {
    const succeeded = await deposit(account, amountTry);
    if (succeeded) {
      onDeposited();
    }
  };

  if (state.status === "success") {
    return (
      <div className="panel min-w-0 rounded-lg p-6">
        <h2 className="font-display text-base font-medium text-panel-text">
          Deposit complete
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
          {state.amountUsdc} USDC landed in your portfolio. This used the
          portfolio&rsquo;s own USDC, exchanged 1:1 for the anchor&rsquo;s
          testnet USDC (both are dollar-pegged testnet tokens; on mainnet
          the anchor delivers the canonical USDC directly and this step
          disappears).
        </p>
        <ol className="mt-4 flex flex-col divide-y divide-panel-border">
          {state.stages.map((event) => (
            <li key={event.stage} className="flex flex-col gap-1 py-2.5">
              <div className="flex items-center justify-between gap-4">
                <span className="min-w-0 truncate text-sm text-panel-text">
                  {event.label}
                </span>
              </div>
              {event.txHash ? (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${event.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit break-all font-mono text-xs text-panel-text/60 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text"
                >
                  {event.txHash}
                </a>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <a
            href="/app/setup"
            className="inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:bg-[var(--color-accent-deep)]"
          >
            Set up or adjust rebalancing
          </a>
          <button type="button" onClick={reset} className="text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text">
            Make another deposit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel min-w-0 rounded-lg p-6">
      <h2 className="font-display text-base font-medium text-panel-text">
        Fund your portfolio in lira
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
        A real SEP-6 deposit against a Stellar testnet anchor. The bank
        transfer and identity check are simulated (this is a sandbox
        anchor, not a real bank); the Stellar side is genuine testnet
        USDC, delivered on-chain.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
            Amount (TRY)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amountTry}
            onChange={(e) => setAmountTry(e.target.value.replace(/[^0-9.]/g, ""))}
            disabled={state.status === "submitting"}
            className="w-full rounded-md border border-panel-border bg-[var(--color-panel-recessed)] px-3 py-2 font-mono text-sm tabular-nums text-panel-text outline-none focus:border-panel-text/40 disabled:opacity-60"
          />
        </label>
        <div className="flex min-w-0 flex-col gap-1 sm:w-40">
          <span className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
            Estimated USDC
          </span>
          <span className="truncate font-mono text-sm tabular-nums text-panel-text/70">
            {estimating ? "..." : estimate ? `~${estimate}` : "-"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={state.status === "submitting"}
        className="mt-4 inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:bg-[var(--color-accent-deep)] disabled:pointer-events-none disabled:opacity-60"
      >
        {state.status === "submitting" ? "Depositing..." : "Start deposit"}
      </button>

      {state.status === "submitting" ? (
        <ol className="mt-4 flex flex-col divide-y divide-panel-border">
          {STAGE_ORDER.slice(0, 2).map((stage) => (
            <li key={stage} className="flex items-center justify-between gap-4 py-2.5">
              <span className="min-w-0 truncate text-sm text-panel-text/70">
                {STAGE_LABELS[stage]}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {state.status === "error" ? (
        <div className="mt-3">
          <p className="text-sm leading-relaxed text-text-faint">{state.message}</p>
          {state.stages.length > 0 ? (
            <ol className="mt-3 flex flex-col divide-y divide-panel-border">
              {state.stages.map((event) => (
                <li key={event.stage} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="min-w-0 truncate text-sm text-panel-text/70">
                    {event.label}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          <button type="button" onClick={reset} className={secondaryButtonClass}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
