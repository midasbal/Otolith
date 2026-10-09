import type { ReactNode } from "react";
import { Button, TextButton, TextLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Notice } from "@/components/ui/states";
import { TxHash } from "@/components/ui/tx-hash";
import { formatBps, formatDurationSeconds } from "@/lib/stellar/format";
import type { PolicyTerms } from "./types";

/*
  Pieces the app's screens share. Presentational only: props in, markup
  out. The one lib import is format.ts, which is pure string formatting.
*/

const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";

/** Where a transaction can be inspected on the public explorer. */
export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_TX}${hash}`;
}

/**
 * The column every app screen sits in. It is marked as a quiet zone, so
 * the background dims itself behind the whole column: the panels, and
 * the text that sits between them.
 */
export function Screen({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div data-quiet="" className={cn("mx-auto flex w-full max-w-3xl flex-col gap-8 px-[var(--space-gutter)] py-10 sm:py-14", className)}>
      {children}
    </div>
  );
}

type ScreenHeaderProps = {
  title: ReactNode;
  /** A control set against the title, such as a link back. */
  action?: ReactNode;
  children?: ReactNode;
};

/** A screen's title and its one-paragraph introduction. */
export function ScreenHeader({ title, action, children }: ScreenHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="font-display text-2xl font-medium tracking-display text-text">{title}</h1>
        {action}
      </div>
      {children ? <p className="max-w-xl text-base leading-relaxed text-text-muted">{children}</p> : null}
    </header>
  );
}

type ConnectPromptProps = {
  connecting: boolean;
  error?: string | null;
  onCreate: () => void;
  onConnect: () => void;
  /** The wording of the "I already have an account" link. */
  connectLabel?: string;
};

/**
 * The two ways in: create an account, or connect with a passkey you
 * already have. Shown wherever a screen needs an account and has none.
 */
export function ConnectPrompt({
  connecting,
  error,
  onCreate,
  onConnect,
  connectLabel = "Have an account already? Connect with your passkey",
}: ConnectPromptProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Button variant="primary" onClick={onCreate} disabled={connecting} loading={connecting}>
          {connecting ? "Working..." : "Create account"}
        </Button>
        <TextButton onClick={onConnect} disabled={connecting}>
          {connectLabel}
        </TextButton>
      </div>
      {error ? (
        <Notice tone="danger" role="alert" className="max-w-xl">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}

/** The four terms of an installed policy, as a list. */
export function PolicyTermsList({ terms, className }: { terms: PolicyTerms; className?: string }) {
  return (
    <DataList className={className}>
      <DataRow label="Target allocation">
        {formatBps(10000 - terms.targetBuyWeightBps)} {terms.sellSymbol} / {formatBps(terms.targetBuyWeightBps)}{" "}
        {terms.buySymbol}
      </DataRow>
      <DataRow label="Drift band">{formatBps(terms.bandThresholdBps)}</DataRow>
      <DataRow label="Slippage tolerance">{formatBps(terms.slippageToleranceBps)}</DataRow>
      <DataRow label="Cooldown" numeric={false}>
        {formatDurationSeconds(terms.cooldownSecs)}
      </DataRow>
    </DataList>
  );
}

/** A submitted transaction: its hash in full, and a link to the explorer. */
export function TransactionReceipt({ hash, className }: { hash: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="ot-caps">Transaction hash</p>
      <TxHash value={hash} />
      <TextLink href={explorerTxUrl(hash)} target="_blank" rel="noreferrer" className="w-fit text-sm">
        View on stellar.expert
      </TextLink>
    </div>
  );
}
