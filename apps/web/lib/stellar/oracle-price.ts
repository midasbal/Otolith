import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { simulateReadCall } from "./contract-call";

// Confirmed directly against the live testnet oracle (see
// contracts/rebalancer/src/lib.rs's own ReflectorClient): prices are
// looked up by ticker symbol, not by contract address, and this is the
// same 600-second staleness window the contracts themselves enforce
// before trusting a price for a real rebalance. Reusing it here, for a
// read-only display, keeps this readout honest about the same thing the
// contracts would refuse to act on.
const MAX_PRICE_AGE_SECS = 600;

function reflectorAssetScVal(symbol: string): xdr.ScVal {
  // ReflectorAsset::Other(Symbol), a Soroban contract enum with one
  // tuple-shaped variant, encodes as a two-element vector: the variant
  // name, then its payload. Confirmed empirically against the live
  // oracle before writing this (a plain lastprice call for "USDC"
  // returned a real, current price using exactly this shape). The same
  // oracle also carries a wider set of major-coin tickers alongside the
  // Stellar assets (confirmed directly against its own assets() call),
  // including BTC and ETH, priced the same way.
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol(symbol)]);
}

type ReflectorPrice = { price: bigint; timestamp: bigint } | undefined;

/**
 * What the oracle has for one asset. `publishedAt` is when the oracle
 * published the price, in Unix seconds.
 *
 * "fresh" is within the staleness window the contracts enforce. "stale" is
 * a real price the oracle published, older than that window: the contracts
 * would refuse to act on it, but it is still the last price there is, so
 * it is returned with its time rather than thrown away. "unavailable" is
 * everything else: the call failed, or the oracle has no price at all.
 */
export type OraclePrice =
  | { kind: "fresh"; price: number; publishedAt: number }
  | { kind: "stale"; price: number; publishedAt: number }
  | { kind: "unavailable" };

/**
 * Reads a single asset's USD price from the oracle, by ticker symbol, the
 * same call shape contracts/rebalancer and contracts/rebalance-policy
 * already use server-side. A price older than the staleness window the
 * contracts enforce comes back as "stale", with its value and publish time;
 * the RPC call failing, or the oracle returning no price at all
 * (Option::None decodes to undefined), comes back as "unavailable". Never
 * throws.
 */
export async function readLivePrice(oracle: string, symbol: string, oracleDecimals: number): Promise<OraclePrice> {
  const simulation = await simulateReadCall(oracle, "lastprice", [reflectorAssetScVal(symbol)]);
  if (rpc.Api.isSimulationError(simulation)) {
    return { kind: "unavailable" };
  }

  const retval = simulation.result?.retval;
  if (!retval) {
    return { kind: "unavailable" };
  }

  const native = scValToNative(retval) as ReflectorPrice;
  if (!native) {
    return { kind: "unavailable" };
  }

  const publishedAt = Number(native.timestamp);
  const price = Number(native.price) / 10 ** oracleDecimals;
  const ageSecs = Math.floor(Date.now() / 1000) - publishedAt;
  return { kind: ageSecs > MAX_PRICE_AGE_SECS ? "stale" : "fresh", price, publishedAt };
}

export async function readOracleDecimals(oracle: string): Promise<number | null> {
  const simulation = await simulateReadCall(oracle, "decimals");
  if (rpc.Api.isSimulationError(simulation)) {
    return null;
  }
  const retval = simulation.result?.retval;
  return retval ? Number(scValToNative(retval)) : null;
}

export type LivePrice = {
  symbol: string;
  /** The last price the oracle published, fresh or not; null if there is none. */
  price: number | null;
  /** Whether `price` is older than the staleness window. */
  stale: boolean;
  /** When `price` was published, in Unix seconds; null if there is no price. */
  publishedAt: number | null;
};

/**
 * Reads USD prices for a batch of ticker symbols from one oracle, sharing
 * a single decimals read across all of them. A symbol whose price is stale
 * comes back with that price, marked stale and dated; one the oracle has no
 * price for comes back with price: null. Neither fails the batch, so one
 * unavailable ticker never hides the others.
 */
export async function getLivePrices(oracle: string, symbols: string[]): Promise<LivePrice[]> {
  const oracleDecimals = await readOracleDecimals(oracle);
  if (oracleDecimals === null) {
    return symbols.map((symbol) => ({ symbol, price: null, stale: false, publishedAt: null }));
  }

  const prices = await Promise.all(
    symbols.map((symbol) => readLivePrice(oracle, symbol, oracleDecimals)),
  );

  return symbols.map((symbol, i) => {
    const read = prices[i];
    return read.kind === "unavailable"
      ? { symbol, price: null, stale: false, publishedAt: null }
      : { symbol, price: read.price, stale: read.kind === "stale", publishedAt: read.publishedAt };
  });
}
