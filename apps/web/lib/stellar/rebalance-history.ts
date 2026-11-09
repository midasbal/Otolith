import { Address, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, sorobanServer } from "./config";
import { BUY_ASSET } from "./policy-config";

// A generous cap on how many rebalance events a single chunk query
// returns. The account this app targets triggers rebalances at most
// every few minutes (the policy's own cooldown, at least 300 seconds),
// so a real account cannot exceed this within a chunk; this is not a
// pagination limit that ever needs to bite in practice.
const MAX_EVENTS = 200;

// getEvents' retention on the public testnet endpoint is about 120,960
// ledgers (roughly 7 days, read from getHealth). A single call spanning a
// wide range often fails with its own separate "processing limit" error
// (JSON-RPC code -32001) well before that, depending on how much unrelated
// network activity falls inside the range, with no pattern tied to span size
// alone. So the search works in bounded chunks, backward from the current
// ledger, newest first. Thirteen chunks of 10,000 ledgers reach just past
// the retention window; the search stops earlier, at the network's own
// oldest ledger, when it gets there.
const CHUNK_LEDGERS = 10_000;
const MAX_CHUNKS = 13;

// A chunk that has not answered by this time counts as failed, and the whole
// search is held to a budget, so a slow or hung endpoint can never leave the
// page waiting: what was found by then is what is shown.
const CHUNK_TIMEOUT_MS = 20_000;
const SCAN_BUDGET_MS = 60_000;

export type RebalanceHistoryEntry = {
  hash: string;
  ledger: number;
  timestamp: number;
  submitter: string;
  sellAmount: string;
  buyAmount: string;
};

/**
 * Why the search stopped where it did, once it has: it reached the oldest
 * ledger the network keeps ("retention"), a chunk failed or timed out
 * ("failure"), the time budget ran out ("time"), or it covered the most it
 * is allowed to ("limit"). Only the first means nothing older can be found.
 */
export type HistoryStop = "retention" | "failure" | "time" | "limit";

export type RebalanceHistoryResult = {
  entries: RebalanceHistoryEntry[];
  /** The oldest ledger the search actually covered. */
  windowStartLedger: number;
  windowEndLedger: number;
  /** True while older ledgers are still being searched: what is here is the newest part, so far. */
  scanning?: boolean;
  /** Why the search ended; absent while it is still running. */
  stoppedBy?: HistoryStop;
};

const RAW_UNITS_PER_TOKEN = BigInt(10_000_000);

/**
 * Converts a raw i128 token amount (7 decimals, true of both v1 assets,
 * confirmed live against their own decimals() calls) to a decimal
 * string, the same shape formatBalanceAmount expects.
 */
function rawToDecimalString(raw: bigint): string {
  const negative = raw < BigInt(0);
  const magnitude = negative ? -raw : raw;
  const whole = magnitude / RAW_UNITS_PER_TOKEN;
  const fraction = (magnitude % RAW_UNITS_PER_TOKEN).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

/**
 * Decodes the submitting account from a transaction envelope, without
 * Horizon: Soroban RPC's own getTransaction response carries the full
 * envelope, and TransactionBuilder.fromXDR parses out its source
 * account directly. Falls back to the inner transaction's source for a
 * fee-bumped envelope, though nothing in this app submits one.
 */
function decodeSubmitter(envelopeXdr: xdr.TransactionEnvelope): string {
  const parsed = TransactionBuilder.fromXDR(envelopeXdr.toXDR("base64"), NETWORK_PASSPHRASE);
  return "source" in parsed ? parsed.source : parsed.innerTransaction.source;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** The oldest ledger the RPC will answer for, or null if it cannot be read. */
async function readOldestLedger(): Promise<number | null> {
  try {
    const health = await withTimeout(sorobanServer.getHealth(), CHUNK_TIMEOUT_MS);
    return typeof health.oldestLedger === "number" ? health.oldestLedger : null;
  } catch {
    return null;
  }
}

/**
 * Resolves one rebalance event to the history entry it stands for, or null
 * if its transaction did not succeed. Throws if the transaction cannot be
 * read, which the caller treats as a failed chunk.
 */
async function resolveEvent(event: rpc.Api.EventResponse): Promise<RebalanceHistoryEntry | null> {
  const tx = await sorobanServer.getTransaction(event.txHash);
  if (tx.status !== rpc.Api.GetTransactionStatus.SUCCESS || !tx.returnValue) {
    return null;
  }

  const [sellAmountRaw, buyAmountRaw] = scValToNative(tx.returnValue) as [bigint, bigint];
  return {
    hash: event.txHash,
    ledger: tx.ledger,
    timestamp: tx.createdAt,
    submitter: decodeSubmitter(tx.envelopeXdr),
    sellAmount: rawToDecimalString(sellAmountRaw),
    buyAmount: rawToDecimalString(buyAmountRaw),
  };
}

/**
 * Reads a smart account's recent rebalance history, purely from public
 * on-chain sources (Soroban RPC only, no indexer, no Horizon, since
 * Horizon has no way to query by contract address and cannot see the
 * non-classic buy asset's balance changes at all).
 *
 * Discovery: the buy asset's (USDC) own SAC emits a standard transfer
 * event on every rebalance's swap, landing in the account being
 * rebalanced. Filtering getEvents by that contract and a topic filter
 * for transfer events destined to this account finds exactly this
 * account's rebalances, with no further sifting needed.
 *
 * Detail: each event's own transaction hash is resolved via
 * getTransaction, which gives the ledger, timestamp, full envelope
 * (decoded for the submitter), and the rebalance's own return value,
 * the exact [sell_amount, buy_amount] pair the swap moved.
 *
 * This is bounded by the RPC endpoint's own retained ledger window
 * (roughly 7 days on the public testnet endpoint), and often by less: a
 * wide range can fail on its own. The search runs newest first, a chunk at
 * a time, and `onProgress` is called with what has been found after each
 * one, so the newest rebalances can be shown while older ledgers are still
 * being searched. When a chunk fails or times out, everything already found
 * is kept and the search stops there; it only throws if not even the newest
 * chunk could be read. windowStartLedger in the result is the true edge of
 * what was actually searched, and `stoppedBy` says why it is where it is,
 * both meant to be shown to the user honestly rather than assumed to be a
 * fixed number of days.
 */
export async function getRebalanceHistory(
  account: string,
  onProgress?: (partial: RebalanceHistoryResult) => void,
): Promise<RebalanceHistoryResult> {
  const filters = [
    {
      type: "contract" as const,
      contractIds: [BUY_ASSET.contract],
      topics: [
        [
          xdr.ScVal.scvSymbol("transfer").toXDR("base64"),
          "*",
          Address.fromString(account).toScVal().toXDR("base64"),
        ],
      ],
    },
  ];

  const startedAt = Date.now();
  const latest = await sorobanServer.getLatestLedger();
  // A chunk that starts below the network's oldest ledger is refused outright,
  // which would throw away everything in it that is still there: so the
  // search never asks for a ledger below it.
  const oldestLedger = (await readOldestLedger()) ?? 1;

  const entries: RebalanceHistoryEntry[] = [];
  let cursor = latest.sequence;
  let windowStartLedger = latest.sequence;
  let covered = 0;
  let stoppedBy: HistoryStop = "limit";

  const snapshot = (scanning: boolean): RebalanceHistoryResult => ({
    entries: [...entries].sort((a, b) => b.ledger - a.ledger),
    windowStartLedger,
    windowEndLedger: latest.sequence,
    ...(scanning ? { scanning: true } : { stoppedBy }),
  });

  for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
    if (cursor <= oldestLedger) {
      stoppedBy = "retention";
      break;
    }
    if (Date.now() - startedAt > SCAN_BUDGET_MS) {
      stoppedBy = "time";
      break;
    }

    const start = Math.max(oldestLedger, cursor - CHUNK_LEDGERS);
    // A chunk gets at most CHUNK_TIMEOUT_MS, and never more than what is left
    // of the budget, so the whole search ends close to the budget and not a
    // chunk's worth of waiting after it.
    const allowedMs = Math.min(CHUNK_TIMEOUT_MS, Math.max(2_000, SCAN_BUDGET_MS - (Date.now() - startedAt)));
    let found: RebalanceHistoryEntry[];
    try {
      found = await withTimeout(
        (async () => {
          const result = await sorobanServer.getEvents({ startLedger: start, filters, limit: MAX_EVENTS });
          const resolved = await Promise.all(result.events.map(resolveEvent));
          return resolved.filter((entry): entry is RebalanceHistoryEntry => entry !== null);
        })(),
        allowedMs,
      );
    } catch {
      // The range was too much for this endpoint, it did not answer in time,
      // or one of the chunk's transactions could not be read. Every chunk
      // already searched is kept, the search goes no further back, and
      // windowStartLedger stays at the oldest ledger it did cover: the honest
      // edge, never a claimed window it did not reach. Nothing is retried,
      // since a retry of the same range tends to fail the same way.
      stoppedBy = Date.now() - startedAt >= SCAN_BUDGET_MS ? "time" : "failure";
      break;
    }

    // Only a chunk that came back whole is counted, and only then does it
    // move the edge.
    entries.push(...found);
    windowStartLedger = start;
    cursor = start;
    covered += 1;

    if (start <= oldestLedger) {
      stoppedBy = "retention";
      break;
    }
    // What was found so far is shown while older ledgers are still searched.
    onProgress?.(snapshot(true));
  }

  if (covered === 0) {
    // Not one chunk could be read, not even the newest: there is no window to
    // report, and an empty list would read as "no rebalances". It is an error.
    throw new Error("The rebalance history could not be read.");
  }

  return snapshot(false);
}
