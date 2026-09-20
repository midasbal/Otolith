import { Address, TransactionBuilder, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, sorobanServer } from "./config";
import { BUY_ASSET } from "./policy-config";

// A generous cap on how many rebalance events a single window query
// returns. The account this app targets triggers rebalances at most
// every few minutes (the policy's own cooldown, at least 300 seconds),
// so a real account cannot exceed this within any window this function
// actually searches; this is not a pagination limit that ever needs to
// bite in practice.
const MAX_EVENTS = 200;

// getEvents' documented retention is generous (confirmed live at
// roughly 120,000 ledgers, about 7 days, on the public testnet
// endpoint), but a single call spanning a wide range often fails with
// its own separate "processing limit" error (JSON-RPC code -32001)
// well before that, depending on how much unrelated network activity
// falls inside the requested range, confirmed by direct testing: some
// 10,000-ledger spans further back succeed, others fail, with no
// pattern tied to span size alone. Querying in bounded chunks, working
// backward from the current ledger, and stopping at the first failure
// (rather than retrying) keeps this function honest: windowStartLedger
// in the result always reflects exactly how far back the search
// actually succeeded, never a claimed window it did not really cover.
const CHUNK_LEDGERS = 10_000;
const MAX_CHUNKS = 4;

export type RebalanceHistoryEntry = {
  hash: string;
  ledger: number;
  timestamp: number;
  submitter: string;
  sellAmount: string;
  buyAmount: string;
};

export type RebalanceHistoryResult = {
  entries: RebalanceHistoryEntry[];
  windowStartLedger: number;
  windowEndLedger: number;
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

/**
 * Searches for matching events in bounded chunks, working backward
 * from the current ledger, stopping as soon as either the network's
 * own retained floor or a chunk's processing-limit error is hit.
 * windowStartLedger in the return value is the oldest ledger a query
 * actually succeeded for, the honest edge of what was searched, not
 * the network's nominal retention limit.
 */
async function queryRecentWindow(topics: string[][]) {
  const latest = await sorobanServer.getLatestLedger();
  const filters = [{ type: "contract" as const, contractIds: [BUY_ASSET.contract], topics }];

  const events: rpc.Api.EventResponse[] = [];
  let cursor = latest.sequence;
  let windowStartLedger = latest.sequence;

  for (let chunk = 0; chunk < MAX_CHUNKS && cursor > 1; chunk++) {
    const start = Math.max(1, cursor - CHUNK_LEDGERS);
    let result;
    try {
      result = await sorobanServer.getEvents({ startLedger: start, filters, limit: MAX_EVENTS });
    } catch {
      // Either the network's retained floor was crossed (a range
      // error) or this endpoint's per-call processing budget was
      // exceeded scanning this range. Either way, stop here rather
      // than retry: windowStartLedger already reflects the oldest
      // ledger a query actually succeeded for.
      break;
    }

    events.push(...result.events);
    windowStartLedger = start;
    cursor = start;

    if (start <= result.oldestLedger) {
      // Reached the network's own retained floor: nothing older is
      // queryable this way on any endpoint, not just this one.
      break;
    }
  }

  return { events, windowStartLedger, windowEndLedger: latest.sequence };
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
 * (nominally up to roughly 7 days on the public testnet endpoint, but
 * see queryRecentWindow above: real coverage per call is often
 * narrower). windowStartLedger in the result is the true edge of what
 * was actually searched this call, meant to be shown to the user
 * honestly rather than assumed to be a fixed number of days.
 */
export async function getRebalanceHistory(account: string): Promise<RebalanceHistoryResult> {
  const topics = [
    [
      xdr.ScVal.scvSymbol("transfer").toXDR("base64"),
      "*",
      Address.fromString(account).toScVal().toXDR("base64"),
    ],
  ];

  const { events, windowStartLedger, windowEndLedger } = await queryRecentWindow(topics);

  const resolved = await Promise.all(
    events.map(async (event): Promise<RebalanceHistoryEntry | null> => {
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
    }),
  );

  const entries = resolved
    .filter((entry): entry is RebalanceHistoryEntry => entry !== null)
    .sort((a, b) => b.ledger - a.ledger);

  return { entries, windowStartLedger, windowEndLedger };
}
