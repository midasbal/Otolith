import { Address, xdr } from "@stellar/stellar-sdk";

/**
 * The full set of RebalancePolicyParams fields, in the shape install()
 * expects them.
 */
export type RebalancePolicyInstallParams = {
  sellAsset: string;
  buyAsset: string;
  router: string;
  oracle: string;
  sellSymbol: string;
  buySymbol: string;
  slippageToleranceBps: number;
  targetBuyWeightBps: number;
  bandThresholdBps: number;
  minTradeSize: number;
  reservedTipBps: number;
  maxCostRatioBps: number;
  cooldownSecs: number;
};

/**
 * Builds the ScVal encoding of RebalancePolicyParams. Map keys sorted
 * alphabetically by field name, matching the contract's own
 * #[contracttype] encoding; do not reorder them.
 */
export function buildRebalancePolicyGateParamsScVal({
  sellAsset,
  buyAsset,
  router,
  oracle,
  sellSymbol,
  buySymbol,
  slippageToleranceBps,
  targetBuyWeightBps,
  bandThresholdBps,
  minTradeSize,
  reservedTipBps,
  maxCostRatioBps,
  cooldownSecs,
}: RebalancePolicyInstallParams): xdr.ScVal {
  const entry = (key: string, val: xdr.ScVal) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });
  const i128 = (n: number) =>
    xdr.ScVal.scvI128(
      new xdr.Int128Parts({ hi: xdr.Int64.fromString("0"), lo: xdr.Uint64.fromString(String(n)) }),
    );

  // pair is a placeholder here: install() derives the real Soroswap pair
  // address itself via a live router_pair_for call and overwrites
  // whatever is passed in before storing. This entry only needs to be
  // present so the map matches RebalancePolicyParams' full field set;
  // any address works, since it is never actually stored.
  return xdr.ScVal.scvMap([
    entry("band_threshold_bps", i128(bandThresholdBps)),
    entry("buy_asset", new Address(buyAsset).toScVal()),
    entry("buy_symbol", xdr.ScVal.scvSymbol(buySymbol)),
    entry("cooldown_secs", xdr.ScVal.scvU64(xdr.Uint64.fromString(String(cooldownSecs)))),
    entry("max_cost_ratio_bps", i128(maxCostRatioBps)),
    entry("min_trade_size", i128(minTradeSize)),
    entry("oracle", new Address(oracle).toScVal()),
    entry("pair", new Address(sellAsset).toScVal()),
    entry("reserved_tip_bps", i128(reservedTipBps)),
    entry("router", new Address(router).toScVal()),
    entry("sell_asset", new Address(sellAsset).toScVal()),
    entry("sell_symbol", xdr.ScVal.scvSymbol(sellSymbol)),
    entry("slippage_tolerance_bps", i128(slippageToleranceBps)),
    entry("target_buy_weight_bps", i128(targetBuyWeightBps)),
  ]);
}
