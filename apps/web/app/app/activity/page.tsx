"use client";

import { truncateAddress, useWallet } from "@/components/wallet-provider";
import { useRebalanceHistory } from "@/components/use-rebalance-history";
import { formatBalanceAmount, formatDurationSeconds } from "@/lib/stellar";

const SECONDS_PER_LEDGER = 5;

const secondaryButtonClass =
  "mt-4 inline-flex w-fit items-center justify-center rounded-md border border-panel-border px-3 py-1.5 text-xs font-medium text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)]";

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ActivityPage() {
  const { address, connecting, error, createWallet, connectWallet } = useWallet();
  const { state, retry } = useRebalanceHistory(address);

  if (!address) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col px-6 py-16 sm:px-10">
        <h1 className="font-display text-2xl font-medium tracking-tight text-text">
          Activity
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
          Connect your account to see its rebalance activity.
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

  const explorerAccountUrl = `https://stellar.expert/explorer/testnet/contract/${address}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-6 py-16 sm:px-10">
      <h1 className="font-display text-2xl font-medium tracking-tight text-text">
        Activity
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
        Recent rebalances for{" "}
        <span className="font-mono text-text">{truncateAddress(address)}</span>, read directly
        from the public Stellar network. Each one is a single, atomic, on-chain transaction:
        anyone can verify it, and your funds never leave this account.
      </p>

      <div className="mt-8 min-w-0">
        {state.status === "loading" ? (
          <p className="text-sm text-text-muted">Reading recent activity from the chain...</p>
        ) : null}

        {state.status === "error" ? (
          <div className="panel min-w-0 rounded-lg p-6">
            <p className="text-sm leading-relaxed text-panel-text/70">{state.message}</p>
            <button type="button" onClick={retry} className={secondaryButtonClass}>
              Retry
            </button>
          </div>
        ) : null}

        {state.status === "loaded" ? (
          <>
            <p className="text-xs leading-relaxed text-text-faint">
              Showing activity from the last{" "}
              {formatDurationSeconds(
                (state.result.windowEndLedger - state.result.windowStartLedger) * SECONDS_PER_LEDGER,
              )}
              , the recent window the public network keeps directly queryable. This is recent
              activity, not the account&rsquo;s full history.{" "}
              <a
                href={explorerAccountUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-hairline-strong underline-offset-4 hover:text-text"
              >
                View the full history on stellar.expert
              </a>
              .
            </p>

            {state.result.entries.length === 0 ? (
              <div className="mt-4 panel min-w-0 rounded-lg p-6">
                <p className="text-sm leading-relaxed text-panel-text/70">
                  No rebalances in the recent window. Your rebalances will appear here once one
                  happens.
                </p>
              </div>
            ) : (
              <ul className="mt-4 flex flex-col gap-4">
                {state.result.entries.map((entry) => (
                  <li key={entry.hash} className="panel min-w-0 rounded-lg p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
                        Rebalance
                      </p>
                      <p className="text-xs text-panel-text/60">{formatTimestamp(entry.timestamp)}</p>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-panel-text">
                      Sold{" "}
                      <span className="font-mono tabular-nums">{formatBalanceAmount(entry.sellAmount)}</span>{" "}
                      XLM, received{" "}
                      <span className="font-mono tabular-nums">{formatBalanceAmount(entry.buyAmount)}</span>{" "}
                      USDC. One atomic on-chain transaction.
                    </p>

                    <div className="mt-4 flex flex-col gap-1 border-t border-panel-border pt-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-panel-text/60">Transaction</span>
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${entry.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate font-mono text-xs text-panel-text underline decoration-hairline-strong underline-offset-4 hover:text-panel-text/80"
                        >
                          {entry.hash}
                        </a>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-panel-text/60">Submitted by</span>
                        <span className="font-mono text-xs text-panel-text">
                          {truncateAddress(entry.submitter)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
