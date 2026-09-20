#![no_std]

// Anyone can call `rebalance`. It reads the current price for both assets
// from a Reflector oracle, reads the account's own strategy settings from
// its rebalance policy (target weight, band, minimum trade size, cost
// tolerance, slippage tolerance), decides whether a rebalance is worth
// doing at all, computes the exact trade size and swap if so, and calls
// Soroswap's router requiring the smart account's authorization. This is
// the "compute" half of compute-then-validate: by the time the account's
// rebalance policy sees the swap, every argument is already fixed. The
// policy (a separate contract, see contracts/rebalance-policy) is the
// "validate" half: it does not trust this contract's math, it derives its
// own acceptable floor from an independent oracle read and checks the
// finished swap against that, and independently enforces a cooldown this
// contract has no say over.
//
// None of the strategy settings are decided here: they are per-user
// settings stored on the policy contract (installed once, range-checked
// there), read back by this contract the same way the slippage tolerance
// already was.
//
// The caller never chooses how much moves. `rebalance` computes the exact
// trade size itself, from the account's live balances, its target weight,
// and a live pool quote, sized so the trade lands on or within
// OVERSHOOT_TOLERANCE_BPS of target, never meaningfully past it. A
// permissionless third party can trigger a rebalance, but never decide its
// size. A live pool quote is needed here and not just the oracle price:
// the oracle alone only prevents overshoot when the pool happens to be
// priced at or below it, and testnet evidence showed the reverse (pool
// priced above oracle) really happens.
//
// Safe default: if either asset has no price on the oracle, or the most
// recent price is older than the staleness limit, this refuses outright.
// No swap is attempted, and there is no fallback price. A wrong or missing
// price is worse than no rebalance at all.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    token, Address, Env, Symbol, Vec,
};

const BPS_DENOMINATOR: i128 = 10_000;

// Maximum age, in seconds, of an oracle price this contract will trust.
// Reflector's free tier updates every 300 seconds (its own resolution()
// value); this allows for one missed update cycle before refusing.
const MAX_PRICE_AGE_SECS: u64 = 600;

// Soroswap's own AMM fee, folded into the cost side of the cost-versus-
// benefit gate. Matches the floor rebalance-policy places on
// slippage_tolerance_bps for the same reason: anything below this is not a
// real trade cost estimate.
const AMM_FEE_BPS: i128 = 30;

// How far past target_buy_weight_bps a rebalance is allowed to land,
// checked against the swap's own real result before returning. Trade size
// is sized against a live pool quote specifically to avoid overshoot (see
// below), but that quote is itself a snapshot: the real fill can still
// differ slightly from it (the pool's price can move between this
// contract's read and the swap actually settling, and the size correction
// itself is a single linear pass against a curved AMM price, not an exact
// inverse). 50 bps covers that residual slack without being loose enough
// to hide a real problem; if a swap would land further past target than
// this, the whole rebalance reverts rather than accept it.
const OVERSHOOT_TOLERANCE_BPS: i128 = 50;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    PriceMissing = 1,
    PriceStale = 2,
    Overflow = 3,
    // Portfolio has no value in this pair at all, nothing to weigh.
    NoValue = 4,
    // Drift from target is within the configured band: not worth acting on.
    BelowBand = 5,
    // The trade sized to close the drift is smaller than the configured
    // dust floor.
    BelowMinTradeSize = 6,
    // The estimated cost of the trade (fee plus slippage tolerance plus
    // reserved tip allowance) exceeds what the drift being corrected is
    // worth, by more than the configured ratio.
    CostExceedsBenefit = 7,
    // The swap's real result landed further past target_buy_weight_bps
    // than OVERSHOOT_TOLERANCE_BPS allows. The whole transaction reverts,
    // undoing the swap along with everything else.
    OvershootTolerance = 8,
    PriceInvalid = 9,
}

// Minimal client for the parts of the Soroswap router interface this
// contract needs. Matches https://github.com/soroswap/core
// contracts/router/src/lib.rs. router_get_amounts_out is a plain view call
// (chained constant-product quotes along path, no state change), used to
// size the trade against the pool's own current price, not just the
// oracle's.
#[contractclient(name = "RouterClient")]
pub trait RouterInterface {
    fn swap_exact_tokens_for_tokens(
        env: Env,
        amount_in: i128,
        amount_out_min: i128,
        path: Vec<Address>,
        to: Address,
        deadline: u64,
    ) -> Vec<i128>;

    fn router_get_amounts_out(env: Env, amount_in: i128, path: Vec<Address>) -> Vec<i128>;
}

// Local mirror of contracts/rebalance-policy's stored params, not a
// dependency on the policy crate itself (a Soroban struct's cross-contract
// encoding matches by field name, not by which Rust type declares it),
// matching the same pattern as the router and oracle clients above. Kept as
// a dev-dependency for tests, where using the real policy contract end to
// end is worth the extra coupling; depending on it at build time would fold
// its whole contract spec into this one's wasm, which is not what a real
// product client needs.
//
// Every field must be mirrored, including cooldown_secs, which this
// contract never reads: the host's map-to-struct decoding requires the
// incoming map and the target struct to have the same number of fields, so
// a genuinely partial mirror fails at the host level, not just a style
// choice.
#[contracttype]
#[derive(Clone)]
pub struct PolicyParams {
    pub sell_asset: Address,
    pub buy_asset: Address,
    pub router: Address,
    // The real Soroswap pair address rebalance-policy's install() derives
    // and stores. The rebalancer itself never reads this field;
    // it exists only because this struct is a genuinely partial mirror
    // failure otherwise (see the comment above), so it must match the real
    // struct's full field set.
    pub pair: Address,
    pub oracle: Address,
    pub sell_symbol: Symbol,
    pub buy_symbol: Symbol,
    pub slippage_tolerance_bps: i128,
    pub target_buy_weight_bps: i128,
    pub band_threshold_bps: i128,
    pub min_trade_size: i128,
    pub reserved_tip_bps: i128,
    pub max_cost_ratio_bps: i128,
    pub cooldown_secs: u64,
}

#[contractclient(name = "RebalancePolicyClient")]
pub trait RebalancePolicyInterface {
    fn get_params(env: Env, smart_account: Address, context_rule_id: u32) -> PolicyParams;
}

// Minimal client for the parts of the Reflector oracle interface this
// contract needs. Matches the SEP-40-compatible ReflectorPulse interface at
// https://github.com/reflector-network/reflector-contract, confirmed
// directly against a live testnet oracle before writing this.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReflectorAsset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReflectorPriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contractclient(name = "ReflectorClient")]
pub trait ReflectorInterface {
    fn lastprice(env: Env, asset: ReflectorAsset) -> Option<ReflectorPriceData>;
}

fn fresh_price(
    env: &Env,
    oracle: &ReflectorClient,
    symbol: &Symbol,
) -> ReflectorPriceData {
    let price = oracle
        .lastprice(&ReflectorAsset::Other(symbol.clone()))
        .unwrap_or_else(|| panic_with_error!(env, Error::PriceMissing));

    let now = env.ledger().timestamp();

    // A future-dated timestamp is rejected outright rather than folded
    // into age via unwrap_or(0), which would otherwise treat it as
    // maximally fresh (age zero) instead of refusing an oracle read that
    // makes no sense (Finding 3, threat model).
    let age = now
        .checked_sub(price.timestamp)
        .unwrap_or_else(|| panic_with_error!(env, Error::PriceStale));
    if age > MAX_PRICE_AGE_SECS {
        panic_with_error!(env, Error::PriceStale);
    }

    // A zero or negative price would silently collapse or invert every
    // downstream computation instead of failing loudly (Finding 4, threat
    // model).
    if price.price <= 0 {
        panic_with_error!(env, Error::PriceInvalid);
    }

    price
}

// Value of `balance` (raw token units, `decimals` places) in the oracle's
// own price scale. Both assets are priced by the same oracle, so a sell
// and buy value computed this way are directly comparable and addable:
// this is the common unit the over-trading gate reasons in throughout.
fn asset_value(env: &Env, balance: i128, price: i128, decimals: u32) -> i128 {
    let scale = 10i128.pow(decimals);
    balance
        .checked_mul(price)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow))
        .checked_div(scale)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow))
}

#[contract]
pub struct Rebalancer;

#[contractimpl]
impl Rebalancer {
    /// account: the smart account whose funds are being rebalanced. policy:
    /// the rebalance-policy instance installed on the account, read here
    /// for its stored strategy settings (target weight, band, minimum
    /// trade size, cost tolerance, slippage tolerance). context_rule_id:
    /// which of the account's context rules that policy installation is
    /// under. router: the Soroswap router. oracle: the Reflector oracle to
    /// price the swap with. sell/buy: the asset pair (SAC or token
    /// contract addresses). sell_symbol/buy_symbol: the Reflector ticker
    /// symbols for the same two assets (Reflector prices assets by symbol,
    /// not by contract address). deadline: ledger-time unix deadline
    /// passed straight through to the router.
    ///
    /// There is no amount_in parameter: this contract computes the exact
    /// trade size itself, from the account's live balances, its target
    /// weight, and a live pool quote, sized so the real result lands
    /// within OVERSHOOT_TOLERANCE_BPS of target, checked against the
    /// swap's own real result before returning. A caller identifies the
    /// account and the rule; it never chooses how much moves.
    pub fn rebalance(
        env: Env,
        account: Address,
        policy: Address,
        context_rule_id: u32,
        router: Address,
        oracle: Address,
        sell: Address,
        buy: Address,
        sell_symbol: Symbol,
        buy_symbol: Symbol,
        deadline: u64,
    ) -> Vec<i128> {
        let oracle_client = ReflectorClient::new(&env, &oracle);
        let sell_price = fresh_price(&env, &oracle_client, &sell_symbol);
        let buy_price = fresh_price(&env, &oracle_client, &buy_symbol);

        let sell_token_decimals = token::Client::new(&env, &sell).decimals();
        let buy_token_decimals = token::Client::new(&env, &buy).decimals();

        // Read after the price checks above: the oracle refusal should not
        // depend on the policy contract being reachable at all.
        let policy_client = RebalancePolicyClient::new(&env, &policy);
        let params = policy_client.get_params(&account, &context_rule_id);

        // Current portfolio state, valued in the oracle's own scale.
        let sell_balance = token::Client::new(&env, &sell).balance(&account);
        let buy_balance = token::Client::new(&env, &buy).balance(&account);
        let sell_value = asset_value(&env, sell_balance, sell_price.price, sell_token_decimals);
        let buy_value = asset_value(&env, buy_balance, buy_price.price, buy_token_decimals);
        let total_value = sell_value
            .checked_add(buy_value)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        if total_value <= 0 {
            panic_with_error!(&env, Error::NoValue);
        }

        // Drift band: only proceed if the account is
        // underweight buy_asset by more than the configured band. A rule
        // only ever sells sell_asset for buy_asset, so being at or above
        // target, or within the band, both mean nothing to do here.
        let current_buy_weight_bps = buy_value
            .checked_mul(BPS_DENOMINATOR)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow))
            .checked_div(total_value)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let drift_bps = params.target_buy_weight_bps - current_buy_weight_bps;
        if drift_bps <= params.band_threshold_bps {
            panic_with_error!(&env, Error::BelowBand);
        }

        // The oracle-only ideal trade size: the amount that would bring
        // buy_weight to target exactly, no further, priced against the
        // oracle alone, with no pool quote involved yet. Shared with
        // contracts/rebalance-policy (see rebalance-sizing), so the two
        // contracts can never independently drift apart on this
        // specific formula. The raw sell-asset size to actually
        // submit still needs a real pool quote below, since the oracle
        // price alone is not what the trade actually executes at.
        let mut amount_in = match rebalance_sizing::ideal_amount_in(
            params.target_buy_weight_bps,
            sell_balance,
            buy_balance,
            sell_price.price,
            buy_price.price,
            sell_token_decimals,
            buy_token_decimals,
        ) {
            Ok(amount) => amount,
            Err(rebalance_sizing::SizingError::NotActionable) => {
                panic_with_error!(&env, Error::BelowBand)
            }
            Err(rebalance_sizing::SizingError::Overflow) => {
                panic_with_error!(&env, Error::Overflow)
            }
        };

        // The value the ideal amount above represents, derived back from
        // it rather than recomputed separately, so there is exactly one
        // place this value is decided (inside the shared crate) even
        // though it is needed again here for the pool-quote comparison
        // below.
        let target_amount_in_value = asset_value(&env, amount_in, sell_price.price, sell_token_decimals);

        // The oracle's own price is frictionless: it says nothing about
        // what the pool will actually give for this trade. If the pool
        // happens to be priced below the oracle, its real fill (already
        // worse, before even Soroswap's own fee) can only fall short of
        // target, which is always safe. But a pool can just as easily be
        // priced above the oracle, in which case executing the full,
        // oracle-only candidate size would overshoot target (this happened
        // on testnet). Querying the pool's real quote for
        // this candidate size and scaling the trade down when the pool
        // would return more value than the oracle implied catches that
        // case too. This is a single linear correction against a curved
        // AMM price, not an exact inverse, which is why the check after
        // the swap below allows OVERSHOOT_TOLERANCE_BPS of slack rather
        // than demanding an exact landing.
        let mut path = Vec::new(&env);
        path.push_back(sell.clone());
        path.push_back(buy.clone());
        let router_client = RouterClient::new(&env, &router);
        let pool_quote = router_client.router_get_amounts_out(&amount_in, &path);
        let pool_output = pool_quote
            .get(pool_quote.len() - 1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let pool_output_value = asset_value(&env, pool_output, buy_price.price, buy_token_decimals);
        if pool_output_value > target_amount_in_value {
            amount_in = amount_in
                .checked_mul(target_amount_in_value)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow))
                .checked_div(pool_output_value)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        }

        // Value actually being moved by the (possibly corrected) trade
        // size, used for the size floor and cost-versus-benefit gate
        // below: this is the real quantity the rest of the gate should
        // reason about, not the pre-correction candidate.
        let amount_in_value = asset_value(&env, amount_in, sell_price.price, sell_token_decimals);

        if amount_in < params.min_trade_size {
            panic_with_error!(&env, Error::BelowMinTradeSize);
        }

        // Cost-versus-benefit gate: benefit is the value of the
        // trade itself (amount_in_value), a close proxy for the drift it
        // corrects, since the trade was sized to close that drift, against
        // the pool's own real quote when the pool disagreed with the
        // oracle. Cost is that same value times the estimated cost rate
        // (Soroswap's fee, plus this rule's own slippage tolerance, plus
        // its reserved tip allowance, none of which are known live from
        // the pool itself). Skip if cost exceeds benefit scaled by the
        // rule's own max_cost_ratio_bps.
        let cost_bps_total = AMM_FEE_BPS + params.slippage_tolerance_bps + params.reserved_tip_bps;
        let cost_value = amount_in_value
            .checked_mul(cost_bps_total)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow))
            .checked_div(BPS_DENOMINATOR)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let lhs = cost_value
            .checked_mul(BPS_DENOMINATOR)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let rhs = amount_in_value
            .checked_mul(params.max_cost_ratio_bps)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        if lhs > rhs {
            panic_with_error!(&env, Error::CostExceedsBenefit);
        }

        // expected_out (raw buy-token units) = amount_in * sell_price /
        // buy_price, adjusted for the two tokens' own decimals. The oracle's
        // own decimals cancel out since both prices use the same scale.
        let numerator = amount_in
            .checked_mul(sell_price.price)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let mut expected_out = numerator
            .checked_div(buy_price.price)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));

        if buy_token_decimals > sell_token_decimals {
            let scale = 10i128.pow(buy_token_decimals - sell_token_decimals);
            expected_out = expected_out
                .checked_mul(scale)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        } else if sell_token_decimals > buy_token_decimals {
            let scale = 10i128.pow(sell_token_decimals - buy_token_decimals);
            expected_out = expected_out
                .checked_div(scale)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        }

        // Rounded up (ceiling division), not down: amount_out_min is a
        // protective minimum submitted to the router, and rounding down
        // would make it slightly looser than the configured tolerance
        // implies (Finding 5, threat model). Contrast with the trade-size
        // divisions elsewhere in this function, which round down
        // deliberately, since the conservative direction there is moving
        // less, not enforcing a stricter minimum.
        let amount_out_min_numerator = expected_out
            .checked_mul(BPS_DENOMINATOR - params.slippage_tolerance_bps)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let amount_out_min = amount_out_min_numerator
            .checked_add(BPS_DENOMINATOR - 1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow))
            .checked_div(BPS_DENOMINATOR)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));

        let result = router_client.swap_exact_tokens_for_tokens(
            &amount_in,
            &amount_out_min,
            &path,
            &account,
            &deadline,
        );

        // Check the swap's real result before returning: recompute the
        // account's new weight from the known pre-swap balances and this
        // exact trade's real effect (sell drops by amount_in, buy rises by
        // the router's own reported output), and refuse to let the whole
        // rebalance stand if it landed further past target than
        // OVERSHOOT_TOLERANCE_BPS allows. Soroban only commits state on a
        // successful transaction, so panicking here reverts the swap
        // itself along with everything else: this is a real, enforced
        // outcome check, not just a sizing estimate.
        let actual_out = result
            .get(result.len() - 1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let new_sell_balance = sell_balance
            .checked_sub(amount_in)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let new_buy_balance = buy_balance
            .checked_add(actual_out)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let new_sell_value = asset_value(&env, new_sell_balance, sell_price.price, sell_token_decimals);
        let new_buy_value = asset_value(&env, new_buy_balance, buy_price.price, buy_token_decimals);
        let new_total_value = new_sell_value
            .checked_add(new_buy_value)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        if new_total_value > 0 {
            let new_buy_weight_bps = new_buy_value
                .checked_mul(BPS_DENOMINATOR)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow))
                .checked_div(new_total_value)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
            if new_buy_weight_bps > params.target_buy_weight_bps + OVERSHOOT_TOLERANCE_BPS {
                panic_with_error!(&env, Error::OvershootTolerance);
            }
        }

        result
    }
}

mod test;
