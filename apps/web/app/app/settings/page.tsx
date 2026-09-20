"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@/components/wallet-provider";
import { usePolicyStatus } from "@/components/use-policy-status";
import { RevokePolicyPanel } from "@/components/revoke-policy-panel";
import { formatBps, formatDurationSeconds } from "@/lib/stellar";

function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail silently (permissions, insecure
      // context); nothing here is worth surfacing as an error.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="shrink-0 rounded-md border border-panel-border px-2.5 py-1 text-xs font-medium text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { address, connecting, error, createWallet, connectWallet } = useWallet();
  const { state: policyState, retry: retryPolicy } = usePolicyStatus(address);

  if (!address) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col px-6 py-16 sm:px-10">
        <h1 className="font-display text-2xl font-medium tracking-tight text-text">
          Settings
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
          Connect your account to see its settings.
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
  const policyInstalled = policyState.status === "loaded" && policyState.result.kind === "installed";

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-6 py-16 sm:px-10">
      <h1 className="font-display text-2xl font-medium tracking-tight text-text">
        Settings
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted">
        Account and policy details for this connection.
      </p>

      <div className="mt-8 min-w-0">
        <div className="panel min-w-0 rounded-lg p-6">
          <p className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
            Account
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-panel-border px-3 py-2.5">
            <span className="min-w-0 truncate font-mono text-sm text-panel-text" title={address}>
              {address}
            </span>
            <CopyAddressButton address={address} />
          </div>
          <a
            href={explorerAccountUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text"
          >
            View on stellar.expert
          </a>
        </div>
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
            <p className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
              Policy
            </p>
            <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
              No rebalance policy is installed on this account yet.
            </p>
            <a
              href="/app/setup"
              className="mt-4 inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:bg-[var(--color-accent-deep)]"
            >
              Set up your portfolio
            </a>
          </div>
        ) : null}

        {policyInstalled && policyState.status === "loaded" && policyState.result.kind === "installed" ? (
          <div className="panel min-w-0 rounded-lg p-6">
            <p className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
              Policy
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
          </div>
        ) : null}
      </div>

      {policyInstalled ? (
        <div className="mt-8 min-w-0">
          <RevokePolicyPanel
            address={address}
            onRevoked={retryPolicy}
            onContinue={() => router.push("/app")}
          />
        </div>
      ) : null}
    </div>
  );
}
