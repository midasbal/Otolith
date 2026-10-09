import { TextLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataList, DataRow } from "@/components/ui/data-list";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { formatBalanceAmount, formatDurationSeconds } from "@/lib/stellar/format";
import { ConnectPrompt, explorerTxUrl, Screen, ScreenHeader } from "./common";
import type { HistoryState } from "./types";

/*
  The activity feed, as markup. The history itself is read by
  app/app/activity/page.tsx and handed in.
*/

const SECONDS_PER_LEDGER = 5;

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type ConnectProps = {
  connecting: boolean;
  error: string | null;
  onCreate: () => void;
  onConnect: () => void;
};

/** The activity screen before an account is connected. */
export function ActivityConnectView({ connecting, error, onCreate, onConnect }: ConnectProps) {
  return (
    <Screen>
      <ScreenHeader title="Activity">Connect your account to see its rebalance activity.</ScreenHeader>
      <ConnectPrompt connecting={connecting} error={error} onCreate={onCreate} onConnect={onConnect} />
    </Screen>
  );
}

type ActivityViewProps = {
  /** The connected address, shortened for display. */
  accountLabel: string;
  state: HistoryState;
  onRetry: () => void;
  explorerAccountUrl: string;
  /** Shortens an address for display. */
  shortenAddress: (address: string) => string;
};

export function ActivityView({ accountLabel, state, onRetry, explorerAccountUrl, shortenAddress }: ActivityViewProps) {
  return (
    <Screen>
      <ScreenHeader title="Activity">
        Recent rebalances for{" "}
        <span className="nm-num text-text">{accountLabel}</span>, read directly
        from the public Stellar network. Each one is a single, atomic, on-chain transaction:
        anyone can verify it, and your funds never leave this account.
      </ScreenHeader>

      <div className="min-w-0">
        {state.status === "loading" ? <LoadingState>Reading recent activity from the chain...</LoadingState> : null}

        {state.status === "error" ? <ErrorState message={state.message} onRetry={onRetry} /> : null}

        {state.status === "loaded" ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm leading-relaxed text-text-muted">
              Showing activity from the last{" "}
              {formatDurationSeconds(
                (state.result.windowEndLedger - state.result.windowStartLedger) * SECONDS_PER_LEDGER,
              )}
              , the recent window the public network keeps directly queryable. This is recent
              activity, not the account&rsquo;s full history.{" "}
              <TextLink href={explorerAccountUrl} target="_blank" rel="noreferrer">
                View the full history on stellar.expert
              </TextLink>
              .
            </p>

            {state.result.entries.length === 0 ? (
              <EmptyState icon="activity">
                No rebalances in the recent window. Your rebalances will appear here once one
                happens.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-6">
                {state.result.entries.map((entry) => (
                  <Card key={entry.hash} as="li" className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="nm-caps">Rebalance</p>
                      <p className="text-sm text-text-muted">{formatTimestamp(entry.timestamp)}</p>
                    </div>

                    <p className="text-base leading-relaxed text-text">
                      Sold{" "}
                      <span className="nm-num">{formatBalanceAmount(entry.sellAmount)}</span>{" "}
                      XLM, received{" "}
                      <span className="nm-num">{formatBalanceAmount(entry.buyAmount)}</span>{" "}
                      USDC. One atomic on-chain transaction.
                    </p>

                    <DataList>
                      <DataRow label="Transaction">
                        <TextLink
                          href={explorerTxUrl(entry.hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs"
                        >
                          {entry.hash}
                        </TextLink>
                      </DataRow>
                      <DataRow label="Submitted by">
                        <span className="text-xs">{shortenAddress(entry.submitter)}</span>
                      </DataRow>
                    </DataList>
                  </Card>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </Screen>
  );
}
