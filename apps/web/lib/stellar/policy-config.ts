// Hardcoded testnet configuration for the v1 rebalance policy: the
// XLM/USDC pair only. Shared by the policy read layer (lib/stellar/policy.ts)
// and the install flow (lib/stellar/policy-params.ts, the setup page), so
// there is exactly one place these addresses live.

export const POLICY_CONTRACT = "CADFMK3SCILEPHADKHRLH6W7HWNY6R3VSTYMWJINIPKDQX5NW2YJKS2Q";
export const REBALANCER_CONTRACT = "CAPGATGURDTJDSUPPD6KC4NKLRG4FY4NOKHFCG7LHZ4FOP3FLKCLNGFV";

export const ROUTER = "CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD";
export const ORACLE = "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63";

export const XLM_ASSET = {
  contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  symbol: "XLM",
};

export const USDC_ASSET = {
  contract: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  symbol: "USDC",
};

// v1's fixed orientation: USDC is always the buy asset, XLM always the
// sell asset. target_buy_weight_bps is therefore always "the target
// percentage of the portfolio held in USDC".
export const SELL_ASSET = XLM_ASSET;
export const BUY_ASSET = USDC_ASSET;

// Params the user never sees or tunes for v1.
export const FIXED_PARAM_DEFAULTS = {
  minTradeSize: 0,
  reservedTipBps: 0,
  maxCostRatioBps: 2500,
};

// On-chain enforced ranges (contracts/rebalance-policy/src/lib.rs,
// install()), mirrored here so the client can reject an out-of-range
// value before ever prompting for a signature. Defaults match the
// contract's own reasonable middle ground.
export const TARGET_BUY_WEIGHT_BPS_RANGE = { min: 0, max: 10000 };

export const BAND_THRESHOLD_BPS_RANGE = { min: 10, max: 2000, default: 200 };
export const SLIPPAGE_TOLERANCE_BPS_RANGE = { min: 30, max: 500, default: 100 };
export const COOLDOWN_SECS_RANGE = { min: 300, max: 604800, default: 3600 };
