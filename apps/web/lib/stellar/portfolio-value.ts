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

type ValuationAssetInput = {
  contract: string;
  symbol: string;
  balance: string;
};

/**
 * Computes live drift and total USD value for an installed policy, by
 * value, from oracle prices, the exact same price source and staleness
 * rule the contracts themselves use. Takes balances already read
 * elsewhere (useSmartAccountBalances) rather than reading them again.
 * Read-only: two oracle reads plus one decimals read, no signing, and it
 * never throws, always resolving to a typed result the caller can render
 * directly, including a graceful "not available right now" case rather
 * than a false zero.
 */
export async function getPortfolioValuation(params: {
  oracle: string;
  sellAsset: ValuationAssetInput;
  buyAsset: ValuationAssetInput;
  targetBuyWeightBps: number;
  bandThresholdBps: number;
}): Promise<PortfolioValuation> {
  try {
    const oracleDecimals = await readOracleDecimals(params.oracle);
    if (oracleDecimals === null) {
      return { kind: "unavailable", reason: "Could not read the oracle's price scale." };
    }

    const [sellPrice, buyPrice] = await Promise.all([
      readLivePrice(params.oracle, params.sellAsset.symbol, oracleDecimals),
      readLivePrice(params.oracle, params.buyAsset.symbol, oracleDecimals),
    ]);

    if (sellPrice === null || buyPrice === null) {
      return { kind: "unavailable", reason: "A live price is not available for this pair right now." };
    }

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
  } catch (err) {
    console.error(err);
    return { kind: "unavailable", reason: "Could not compute the portfolio's live value right now." };
  }
}
