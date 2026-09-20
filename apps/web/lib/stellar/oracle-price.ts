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
 * Reads a single asset's live USD price from the oracle, by ticker
 * symbol, the same call shape contracts/rebalancer and
 * contracts/rebalance-policy already use server-side. Returns null for
 * every way this can fail to produce a number worth trusting: the RPC
 * call itself failing, the oracle returning no price at all (Option::None
 * decodes to undefined), or the price being older than the same
 * staleness window the contracts enforce. Never throws.
 */
export async function readLivePrice(oracle: string, symbol: string, oracleDecimals: number): Promise<number | null> {
  const simulation = await simulateReadCall(oracle, "lastprice", [reflectorAssetScVal(symbol)]);
  if (rpc.Api.isSimulationError(simulation)) {
    return null;
  }

  const retval = simulation.result?.retval;
  if (!retval) {
    return null;
  }

  const native = scValToNative(retval) as ReflectorPrice;
  if (!native) {
    return null;
  }

  const ageSecs = Math.floor(Date.now() / 1000) - Number(native.timestamp);
  if (ageSecs > MAX_PRICE_AGE_SECS) {
    return null;
  }

  return Number(native.price) / 10 ** oracleDecimals;
}

export async function readOracleDecimals(oracle: string): Promise<number | null> {
  const simulation = await simulateReadCall(oracle, "decimals");
  if (rpc.Api.isSimulationError(simulation)) {
    return null;
  }
  const retval = simulation.result?.retval;
  return retval ? Number(scValToNative(retval)) : null;
}

export type LivePrice = { symbol: string; price: number | null };

/**
 * Reads live USD prices for a batch of ticker symbols from one oracle,
 * sharing a single decimals read across all of them. A symbol the oracle
 * has no current, fresh price for comes back with price: null rather
 * than failing the whole batch, so one unavailable ticker never hides
 * the others.
 */
export async function getLivePrices(oracle: string, symbols: string[]): Promise<LivePrice[]> {
  const oracleDecimals = await readOracleDecimals(oracle);
  if (oracleDecimals === null) {
    return symbols.map((symbol) => ({ symbol, price: null }));
  }

  const prices = await Promise.all(
    symbols.map((symbol) => readLivePrice(oracle, symbol, oracleDecimals)),
  );

  return symbols.map((symbol, i) => ({ symbol, price: prices[i] }));
}
