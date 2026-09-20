"use client";

import { useState } from "react";
import { useRevokePolicy } from "@/components/use-revoke-policy";

type RevokePolicyPanelProps = {
  address: string;
  onRevoked: () => void;
  onContinue: () => void;
};

/**
 * The revoke control's one source of truth: the two-step inline confirm,
 * the honest copy about what revoking does and does not touch, and the
 * post-revoke success view with the transaction hash. Settings is this
 * panel's only home; keep it that way rather than rendering it a second
 * time elsewhere.
 */
export function RevokePolicyPanel({ address, onRevoked, onContinue }: RevokePolicyPanelProps) {
  const { state, revoke } = useRevokePolicy();
  const [confirming, setConfirming] = useState(false);

  const handleRevoke = async () => {
    setConfirming(false);
    const succeeded = await revoke(address);
    if (succeeded) {
      onRevoked();
    }
  };

  if (state.status === "success") {
    return (
      <div className="panel min-w-0 rounded-lg p-6">
        <h2 className="font-display text-base font-medium text-panel-text">
          Policy revoked
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
          The standing rebalance authorization on this account has been
          removed. No further rebalance can be triggered. Your funds stayed
          in your account the whole time and are untouched; you can set up
          a new policy whenever you want.
        </p>
        <p className="mt-4 text-xs text-panel-text/60">Transaction hash</p>
        <p className="mt-1 break-all font-mono text-sm text-panel-text">{state.hash}</p>
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${state.hash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text"
        >
          View on stellar.expert
        </a>
        <div className="mt-6">
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--duration-fast)] ease-[var(--ease-settle)] hover:bg-[var(--color-accent-deep)]"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel min-w-0 rounded-lg p-6">
      <p className="text-xs uppercase tracking-[0.14em] text-panel-text/60">
        Revoke
      </p>
      <p className="mt-2 text-sm leading-relaxed text-panel-text/70">
        Revoking removes this account&rsquo;s standing rebalance
        authorization. No further rebalance can be triggered until you set
        up a new policy. Your funds stay in your account, untouched; you
        are only withdrawing the permission, not moving anything.
      </p>

      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className="text-sm leading-relaxed text-panel-text">
            Revoke this policy? This needs one more passkey signature.
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={state.status === "revoking"}
              className="inline-flex w-fit items-center justify-center rounded-md border border-panel-text/40 px-3 py-1.5 text-xs font-medium text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)] disabled:pointer-events-none disabled:opacity-60"
            >
              {state.status === "revoking" ? "Revoking..." : "Confirm revoke"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={state.status === "revoking"}
              className="text-sm text-panel-text/70 underline decoration-hairline-strong underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text disabled:pointer-events-none disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 inline-flex w-fit items-center justify-center rounded-md border border-panel-border px-3 py-1.5 text-xs font-medium text-panel-text transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-panel-recessed)]"
        >
          Revoke policy
        </button>
      )}

      {state.status === "error" ? (
        <p className="mt-3 text-sm leading-relaxed text-text-faint">{state.message}</p>
      ) : null}
    </div>
  );
}
