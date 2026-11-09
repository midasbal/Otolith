import { readLivePrice, readOracleDecimals } from "./oracle-price";

export type PortfolioAssetValue = {
  code: string;
  contract: string;
  balance: string;
  price: number | null;
  usdValue: number | null;
};

export type PortfolioValuation =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "valued";
      /**
       * Set only when the value was worked out from a price older than the
       * oracle's staleness window: when that price was published, in Unix
       * seconds. The value is then a dated snapshot, and the band state
       * below is not a verdict on whether a rebalance is due.
       */
      priceAsOf?: number;
      totalUsdValue: number;
      sellAsset: PortfolioAssetValue;
      buyAsset: PortfolioAssetValue;
      // The buy asset's (USDC's) current weight by value, in the same
      // bps terms the contracts use for target_buy_weight_bps.
      currentBuyWeightBps: number;
      targetBuyWeightBps: number;
      bandThresholdBps: number;
      // current minus target, so a positive number reads as "overweight
      // the buy asset relative to target" and a negative number as
      // "underweight," matching how the figure is labeled on screen.
      driftBps: number;
      // The rebalancer only ever sells sell_asset for buy_asset (v1's
      // fixed one-directional design, see contracts/rebalancer): it can
      // trigger only when underweight buy_asset by more than the band,
      // never when at, above, or only slightly below target. "overweight"
      // is called out on its own rather than folded into "within_band"
      // so the readout does not imply a rebalance could ever be pending
      // in a direction the contract does not act in.
      bandState: "within_band" | "past_band" | "overweight";
    };

export type ValuationAssetInput = {
  contract: string;
  symbol: string;
  balance: string;
};

export type ValuationInput = {
  sellAsset: ValuationAssetInput;
  buyAsset: ValuationAssetInput;
  targetBuyWeightBps: number;
  bandThresholdBps: number;
};

/**
 * The oracle's prices for the pair, or why there are none. "stale" carries
 * the last published prices, at least one of them older than the staleness
 * window, with the earliest publish time of the two.
 */
export type ValuationPrices =
  | { kind: "ok"; sellPrice: number; buyPrice: number }
  | { kind: "stale"; sellPrice: number; buyPrice: number; publishedAt: number }
  | { kind: "unavailable"; reason: string };

/**
 * Reads the USD price of both assets from the oracle, the exact same
 * price source and staleness rule the contracts themselves use. A price
 * past that rule is returned as "stale", dated, instead of dropped.
 * Read-only: one decimals read, then two price reads. It does not need
 * the account's balances, so it can run, and be kept, on its own. It
 * never throws, always resolving to a typed result, including a graceful
 * "not available right now" case rather than a false zero.
 */
export async function getValuationPrices(
  oracle: string,
  sellSymbol: string,
  buySymbol: string,
): Promise<ValuationPrices> {
  try {
    const oracleDecimals = await readOracleDecimals(oracle);
    if (oracleDecimals === null) {
      return { kind: "unavailable", reason: "Could not read the oracle's price scale." };
    }

    const [sellPrice, buyPrice] = await Promise.all([
      readLivePrice(oracle, sellSymbol, oracleDecimals),
      readLivePrice(oracle, buySymbol, oracleDecimals),
    ]);

    if (sellPrice.kind === "unavailable" || buyPrice.kind === "unavailable") {
      return { kind: "unavailable", reason: "A live price is not available for this pair right now." };
    }

    if (sellPrice.kind === "stale" || buyPrice.kind === "stale") {
      return {
        kind: "stale",
        sellPrice: sellPrice.price,
        buyPrice: buyPrice.price,
        publishedAt: Math.min(sellPrice.publishedAt, buyPrice.publishedAt),
      };
    }

    return { kind: "ok", sellPrice: sellPrice.price, buyPrice: buyPrice.price };
  } catch (err) {
    console.error(err);
    return { kind: "unavailable", reason: "Could not compute the portfolio's live value right now." };
  }
}

/**
 * Computes live drift and total USD value for an installed policy, by
 * value, from oracle prices (getValuationPrices) and balances already
 * read elsewhere (useSmartAccountBalances). Pure: no reads, so it can be
 * recomputed for free whenever either input changes.
 */
export function computeValuation(params: ValuationInput, prices: ValuationPrices): PortfolioValuation {
  if (prices.kind === "unavailable") {
    return { kind: "unavailable", reason: prices.reason };
  }
  const { sellPrice, buyPrice } = prices;
  const priceAsOf = prices.kind === "stale" ? prices.publishedAt : undefined;

  // Display-only arithmetic: balances are already decimal strings
  // (see lib/stellar/smart-account-balances.ts), and a USD figure
  // shown to two decimal places has no precision concern at this
  // scale. This never feeds back into a contract call or an amount
  // that gets signed, unlike the raw-stroop math elsewhere in this
  // app, which does stay in string/bigint arithmetic on purpose.
  const sellValue = Number(params.sellAsset.balance) * sellPrice;
  const buyValue = Number(params.buyAsset.balance) * buyPrice;
  const totalUsdValue = sellValue + buyValue;

  const currentBuyWeightBps = totalUsdValue > 0 ? Math.round((buyValue / totalUsdValue) * 10000) : 0;
  const driftBps = currentBuyWeightBps - params.targetBuyWeightBps;

  let bandState: "within_band" | "past_band" | "overweight";
  if (currentBuyWeightBps >= params.targetBuyWeightBps) {
    bandState = "overweight";
  } else if (params.targetBuyWeightBps - currentBuyWeightBps > params.bandThresholdBps) {
    bandState = "past_band";
  } else {
    bandState = "within_band";
  }

  return {
    kind: "valued",
    ...(priceAsOf !== undefined ? { priceAsOf } : {}),
    totalUsdValue,
    sellAsset: {
      code: params.sellAsset.symbol,
      contract: params.sellAsset.contract,
      balance: params.sellAsset.balance,
      price: sellPrice,
      usdValue: sellValue,
    },
    buyAsset: {
      code: params.buyAsset.symbol,
      contract: params.buyAsset.contract,
      balance: params.buyAsset.balance,
      price: buyPrice,
      usdValue: buyValue,
    },
    currentBuyWeightBps,
    targetBuyWeightBps: params.targetBuyWeightBps,
    bandThresholdBps: params.bandThresholdBps,
    driftBps,
    bandState,
  };
}
