#![cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, testutils::Ledger, token, Address, Env, Map,
    Symbol, Vec,
};

use crate::{ReflectorAsset, ReflectorPriceData, Rebalancer, RebalancerClient};
use rebalance_policy::{RebalancePolicy, RebalancePolicyClient, RebalancePolicyParams};
use stellar_accounts::policies::Policy;
use stellar_accounts::smart_account::{ContextRule, ContextRuleType, Signer};

// By default, records whatever amount_in and amount_out_min it was called
// with, instead of doing any real AMM math, so a test can check exactly
// what the rebalancer computed and passed along. set_swap_override_out lets
// a test force a specific real output instead, to exercise the post-swap
// overshoot check directly. router_get_amounts_out applies a settable
// rate_bps to whatever a real pool would give at oracle parity (both test
// assets are priced 1:1 in every fixture here), so a test can simulate a
// pool priced above or below the oracle. Real execution price and a real
// pool's real curve are both proven on testnet against the real Soroswap
// router.
#[contract]
struct MockRouter;

#[contractimpl]
impl MockRouter {
    pub fn set_pool_rate_bps(env: Env, rate_bps: i128) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "rate_bps"), &rate_bps);
    }

    pub fn set_swap_override_out(env: Env, amount: i128) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "override_out"), &amount);
    }

    pub fn router_get_amounts_out(env: Env, amount_in: i128, _path: Vec<Address>) -> Vec<i128> {
        let rate_bps: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "rate_bps"))
            .unwrap_or(9_970);
        let out = amount_in * rate_bps / 10_000;
        let mut result = Vec::new(&env);
        result.push_back(amount_in);
        result.push_back(out);
        result
    }

    pub fn swap_exact_tokens_for_tokens(
        env: Env,
        amount_in: i128,
        amount_out_min: i128,
        _path: Vec<Address>,
        _to: Address,
        _deadline: u64,
    ) -> Vec<i128> {
        let out: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "override_out"))
            .unwrap_or(amount_out_min);
        let mut result = Vec::new(&env);
        result.push_back(amount_in);
        result.push_back(out);
        result
    }

    // rebalance-policy's install() now derives and stores the real pair
    // address via a live router_pair_for call. These tests
    // never read that stored value back, only exercise the over-trading
    // gate through get_params, so any address works here.
    pub fn router_pair_for(env: Env, _token_a: Address, _token_b: Address) -> Address {
        Address::generate(&env)
    }
}

// A minimal mock Reflector oracle for local tests. Real behavior (live
// price, real staleness) is proven on testnet against the real oracle; this
// mock only needs to return whatever price and timestamp the test sets, so
// the rebalancer's own staleness and missing-price logic can be exercised
// without waiting on real time to pass.
#[contract]
struct MockOracle;

#[contractimpl]
impl MockOracle {
    pub fn set_price(env: Env, symbol: Symbol, price: i128, timestamp: u64) {
        let mut prices: Map<Symbol, (i128, u64)> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "prices"))
            .unwrap_or_else(|| Map::new(&env));
        prices.set(symbol, (price, timestamp));
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "prices"), &prices);
    }

    pub fn lastprice(env: Env, asset: ReflectorAsset) -> Option<ReflectorPriceData> {
        let symbol = match asset {
            ReflectorAsset::Other(symbol) => symbol,
            ReflectorAsset::Stellar(_) => return None,
        };
        let prices: Map<Symbol, (i128, u64)> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "prices"))
            .unwrap_or_else(|| Map::new(&env));
        prices
            .get(symbol)
            .map(|(price, timestamp)| ReflectorPriceData { price, timestamp })
    }
}

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    let oracle = env.register(MockOracle, ());
    let rebalancer = env.register(Rebalancer, ());
    (env, oracle, rebalancer)
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn refuses_stale_price() {
    let (env, oracle, rebalancer) = setup();
    env.mock_all_auths();

    let sell_symbol = Symbol::new(&env, "XLM");
    let buy_symbol = Symbol::new(&env, "USDC");

    let now = 1_700_000_000u64;
    env.ledger().set_timestamp(now);

    let oracle_client = MockOracleClient::new(&env, &oracle);
    // Older than the 600 second staleness limit.
    oracle_client.set_price(&sell_symbol, &16_897_358_622_104i128, &(now - 700));
    oracle_client.set_price(&buy_symbol, &100_075_010_606_956i128, &(now - 10));

    let sell = Address::generate(&env);
    let buy = Address::generate(&env);
    let account = Address::generate(&env);
    let router = Address::generate(&env);
    // The price checks run before the policy is ever consulted, so a
    // nonexistent policy address is fine for this test: it should never be
    // called.
    let policy = Address::generate(&env);

    let client = RebalancerClient::new(&env, &rebalancer);
    client.rebalance(
        &account,
        &policy,
        &1u32,
        &router,
        &oracle,
        &sell,
        &buy,
        &sell_symbol,
        &buy_symbol,
        &(now + 3600),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn refuses_missing_price() {
    let (env, oracle, rebalancer) = setup();
    env.mock_all_auths();

    let sell_symbol = Symbol::new(&env, "XLM");
    let buy_symbol = Symbol::new(&env, "OTLT");

    let now = 1_700_000_000u64;
    env.ledger().set_timestamp(now);

    let oracle_client = MockOracleClient::new(&env, &oracle);
    oracle_client.set_price(&sell_symbol, &16_897_358_622_104i128, &(now - 10));
    // No price set for buy_symbol at all, matching a real asset the oracle
    // has no feed for.

    let sell = Address::generate(&env);
    let buy = Address::generate(&env);
    let account = Address::generate(&env);
    let router = Address::generate(&env);
    let policy = Address::generate(&env);

    let client = RebalancerClient::new(&env, &rebalancer);
    client.rebalance(
        &account,
        &policy,
        &1u32,
        &router,
        &oracle,
        &sell,
        &buy,
        &sell_symbol,
        &buy_symbol,
        &(now + 3600),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn refuses_future_price() {
    // Finding 3 (threat model): a timestamp strictly in the future used to
    // be folded into age via unwrap_or(0), treating it as maximally fresh
    // instead of refusing an oracle read that makes no sense.
    let (env, oracle, rebalancer) = setup();
    env.mock_all_auths();

    let sell_symbol = Symbol::new(&env, "XLM");
    let buy_symbol = Symbol::new(&env, "USDC");

    let now = 1_700_000_000u64;
    env.ledger().set_timestamp(now);

    let oracle_client = MockOracleClient::new(&env, &oracle);
    // One second ahead of the current ledger timestamp.
    oracle_client.set_price(&sell_symbol, &16_897_358_622_104i128, &(now + 1));
    oracle_client.set_price(&buy_symbol, &100_075_010_606_956i128, &(now - 10));

    let sell = Address::generate(&env);
    let buy = Address::generate(&env);
    let account = Address::generate(&env);
    let router = Address::generate(&env);
    let policy = Address::generate(&env);

    let client = RebalancerClient::new(&env, &rebalancer);
    client.rebalance(
        &account,
        &policy,
        &1u32,
        &router,
        &oracle,
        &sell,
        &buy,
        &sell_symbol,
        &buy_symbol,
        &(now + 3600),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn refuses_zero_price() {
    // Finding 4 (threat model): a zero or negative oracle price used to
    // pass the freshness check silently, collapsing every downstream
    // computation instead of failing loudly.
    let (env, oracle, rebalancer) = setup();
    env.mock_all_auths();

    let sell_symbol = Symbol::new(&env, "XLM");
    let buy_symbol = Symbol::new(&env, "USDC");

    let now = 1_700_000_000u64;
    env.ledger().set_timestamp(now);

    let oracle_client = MockOracleClient::new(&env, &oracle);
    oracle_client.set_price(&sell_symbol, &0i128, &(now - 10));
    oracle_client.set_price(&buy_symbol, &100_075_010_606_956i128, &(now - 10));

    let sell = Address::generate(&env);
    let buy = Address::generate(&env);
    let account = Address::generate(&env);
    let router = Address::generate(&env);
    let policy = Address::generate(&env);

    let client = RebalancerClient::new(&env, &rebalancer);
    client.rebalance(
        &account,
        &policy,
        &1u32,
        &router,
        &oracle,
        &sell,
        &buy,
        &sell_symbol,
        &buy_symbol,
        &(now + 3600),
    );
}

const NOW: u64 = 1_700_000_000u64;

struct Gate {
    env: Env,
    rebalancer: Address,
    policy: Address,
    account: Address,
    router: Address,
    oracle: Address,
    sell: Address,
    buy: Address,
    sell_symbol: Symbol,
    buy_symbol: Symbol,
}

impl Gate {
    fn rebalance(&self) -> Vec<i128> {
        let client = RebalancerClient::new(&self.env, &self.rebalancer);
        client.rebalance(
            &self.account,
            &self.policy,
            &1u32,
            &self.router,
            &self.oracle,
            &self.sell,
            &self.buy,
            &self.sell_symbol,
            &self.buy_symbol,
            &(NOW + 3600),
        )
    }
}

// Sell and buy priced at parity (both 1e14, matching Reflector's 14-decimal
// scale) and both SACs use 7 decimals, so value = balance * 1e7 exactly,
// with no further scaling. Keeps every gate boundary in these tests
// checkable by hand. sell_balance and buy_balance are raw token units.
#[allow(clippy::too_many_arguments)]
fn setup_gate(
    sell_balance: i128,
    buy_balance: i128,
    target_buy_weight_bps: i128,
    band_threshold_bps: i128,
    min_trade_size: i128,
    slippage_tolerance_bps: i128,
    reserved_tip_bps: i128,
    max_cost_ratio_bps: i128,
) -> Gate {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);

    let oracle = env.register(MockOracle, ());
    let rebalancer = env.register(Rebalancer, ());
    let router = env.register(MockRouter, ());

    let sell_symbol = Symbol::new(&env, "XLM");
    let buy_symbol = Symbol::new(&env, "USDC");
    let oracle_client = MockOracleClient::new(&env, &oracle);
    oracle_client.set_price(&sell_symbol, &100_000_000_000_000i128, &(NOW - 10));
    oracle_client.set_price(&buy_symbol, &100_000_000_000_000i128, &(NOW - 10));

    let sell = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let buy = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();

    let account = Address::generate(&env);
    token::StellarAssetClient::new(&env, &sell).mint(&account, &sell_balance);
    token::StellarAssetClient::new(&env, &buy).mint(&account, &buy_balance);

    let policy = env.register(RebalancePolicy, ());
    let rule = ContextRule {
        id: 1,
        context_type: ContextRuleType::Default,
        name: soroban_sdk::String::from_str(&env, "rebalance"),
        signers: soroban_sdk::Vec::<Signer>::new(&env),
        signer_ids: soroban_sdk::Vec::new(&env),
        policies: soroban_sdk::Vec::new(&env),
        policy_ids: soroban_sdk::Vec::new(&env),
        valid_until: None,
    };
    let params = RebalancePolicyParams {
        sell_asset: sell.clone(),
        buy_asset: buy.clone(),
        router: router.clone(),
        // install() derives and overwrites this itself via a live
        // router_pair_for call; this test never reads it back.
        pair: Address::generate(&env),
        oracle: oracle.clone(),
        sell_symbol: sell_symbol.clone(),
        buy_symbol: buy_symbol.clone(),
        slippage_tolerance_bps,
        target_buy_weight_bps,
        band_threshold_bps,
        min_trade_size,
        reserved_tip_bps,
        max_cost_ratio_bps,
        cooldown_secs: 300,
    };
    env.as_contract(&policy, || {
        RebalancePolicy::install(&env, params, rule, account.clone());
    });

    Gate {
        env,
        rebalancer,
        policy,
        account,
        router,
        oracle,
        sell,
        buy,
        sell_symbol,
        buy_symbol,
    }
}

// 1000.0 sell_asset, 0 buy_asset: 100% sell, 0% buy. Target 10% buy_asset,
// within rebalance-policy's own 10 to 2000 bps band_threshold_bps range
// (a 50% target would need a band past that range to ever be "inside").
// With buy_balance at zero, drift is exactly target_buy_weight_bps: 1000
// bps. Used by both the band boundary tests below.
const SELL_BALANCE: i128 = 1_000_0000000;
const BUY_BALANCE: i128 = 0;
const TARGET_BUY_WEIGHT_BPS: i128 = 1_000;
// Exact drift for the balances above: moving from 0% to 10% of a portfolio
// whose only value is the 1000 units of sell_asset means moving a tenth of
// it.
const EXPECTED_AMOUNT_IN: i128 = 100_0000000;

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn drift_just_inside_band_does_nothing() {
    // band_threshold_bps == drift_bps exactly: the check is strict
    // (drift_bps <= band_threshold_bps skips), so equal counts as inside.
    let g = setup_gate(SELL_BALANCE, BUY_BALANCE, TARGET_BUY_WEIGHT_BPS, 1_000, 0, 100, 0, 2_500);
    g.rebalance();
}

#[test]
fn drift_just_outside_band_triggers() {
    // One basis point tighter than the exact drift: now actionable.
    let g = setup_gate(SELL_BALANCE, BUY_BALANCE, TARGET_BUY_WEIGHT_BPS, 999, 0, 100, 0, 2_500);
    let result = g.rebalance();
    assert_eq!(result.get(0).unwrap(), EXPECTED_AMOUNT_IN);
}

#[test]
fn computed_trade_lands_on_target_without_overshoot() {
    let g = setup_gate(SELL_BALANCE, BUY_BALANCE, TARGET_BUY_WEIGHT_BPS, 999, 0, 100, 0, 2_500);
    let result = g.rebalance();
    let amount_in = result.get(0).unwrap();
    assert_eq!(amount_in, EXPECTED_AMOUNT_IN);

    // Confirm this amount, valued at the same oracle price used to size it,
    // brings buy_weight to exactly target: new_buy_value = amount_in (in
    // value terms) since buy started at zero; new_total_value is unchanged
    // (an ideal, frictionless move of value from one asset to the other).
    // This test's mock pool is priced at oracle parity (the default
    // rate_bps), where a real swap only ever returns less than this ideal
    // amount, landing short of target, not past it. premium_pool_sizing_
    // avoids_overshoot below covers the case where the pool disagrees with
    // the oracle in the other direction, which this simple case does not
    // exercise.
    // value = balance * price / 10^decimals = balance * 1e14 / 1e7 = balance * 1e7
    let sell_value = SELL_BALANCE * 10_000_000;
    let amount_in_value = amount_in * 10_000_000;
    let new_buy_value = amount_in_value;
    let new_total_value = sell_value;
    let new_buy_weight_bps = new_buy_value * 10_000 / new_total_value;
    assert_eq!(new_buy_weight_bps, TARGET_BUY_WEIGHT_BPS);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn trade_below_min_size_skipped() {
    // Same drift as the passing case above (100_0000000 computed), but the
    // rule demands at least one more unit than that.
    let g = setup_gate(
        SELL_BALANCE,
        BUY_BALANCE,
        TARGET_BUY_WEIGHT_BPS,
        999,
        EXPECTED_AMOUNT_IN + 1,
        100,
        0,
        2_500,
    );
    g.rebalance();
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn cost_exceeds_benefit_skipped() {
    // cost_bps_total = 30 (AMM fee) + 500 (max allowed slippage tolerance)
    // + 1000 (max allowed reserved tip) = 1530, comfortably above the
    // minimum allowed max_cost_ratio_bps of 500: this rule's own settings
    // say the trade is not worth its estimated cost.
    let g = setup_gate(SELL_BALANCE, BUY_BALANCE, TARGET_BUY_WEIGHT_BPS, 999, 0, 500, 1_000, 500);
    g.rebalance();
}

#[test]
fn computes_amount_out_min_from_policy_tolerance() {
    let g = setup_gate(SELL_BALANCE, BUY_BALANCE, TARGET_BUY_WEIGHT_BPS, 999, 0, 100, 0, 2_500);

    // Prove the tolerance really came from the policy install above, not a
    // value baked into the rebalancer.
    assert_eq!(
        RebalancePolicyClient::new(&g.env, &g.policy)
            .get_params(&g.account, &1u32)
            .slippage_tolerance_bps,
        100
    );

    let result = g.rebalance();

    // 1% tolerance on a 1:1 price: amount_out_min should be exactly 99% of
    // the computed amount_in, the same floor contracts/rebalance-policy
    // independently computes and checks.
    assert_eq!(result.get(0).unwrap(), EXPECTED_AMOUNT_IN);
    assert_eq!(result.get(1).unwrap(), 99_0000000i128);
}

#[test]
fn amount_out_min_rounds_up_not_down() {
    // Finding 5 (threat model): amount_out_min is a protective minimum
    // submitted to the router, so its division must round up, never down.
    // target_buy_weight_bps of 10000 with a zero buy balance makes
    // amount_in land exactly on sell_balance (no rounding loss in the
    // sizing step itself), isolating the amount_out_min division as the
    // only source of rounding in this test. sell_balance is chosen so the
    // division is not exact, and floor and ceiling genuinely disagree.
    let sell_balance = 1_234_567i128;
    let g = setup_gate(sell_balance, 0, 10_000, 200, 0, 100, 0, 2_500);

    let result = g.rebalance();
    let amount_in = result.get(0).unwrap();
    assert_eq!(amount_in, sell_balance);

    let numerator = amount_in * (10_000 - 100);
    let floor_div = numerator / 10_000;
    let ceil_div = (numerator + 10_000 - 1) / 10_000;
    assert_ne!(floor_div, ceil_div, "test setup must exercise a non-exact division");
    assert_eq!(result.get(1).unwrap(), ceil_div);
}

// Regression test for a real testnet finding: sizing
// against the oracle price alone can overshoot target when the real pool
// is priced above the oracle, since the pool then returns more value per
// unit sold than the oracle implied. Reproduces that condition with a pool
// quoted 10% above oracle parity (rate_bps 11_000) and confirms the trade
// size is scaled down, landing within OVERSHOOT_TOLERANCE_BPS of target.
#[test]
fn premium_pool_sizing_avoids_overshoot() {
    let g = setup_gate(SELL_BALANCE, BUY_BALANCE, TARGET_BUY_WEIGHT_BPS, 999, 0, 100, 0, 2_500);
    MockRouterClient::new(&g.env, &g.router).set_pool_rate_bps(&11_000);

    let result = g.rebalance();
    let amount_in = result.get(0).unwrap();

    // Same formula the contract applies: the oracle-only candidate
    // (EXPECTED_AMOUNT_IN) scaled down by target_amount_in_value over the
    // pool's quoted value at that candidate size.
    let target_amount_in_value = 10_000_000_000_000_000i128; // see EXPECTED_AMOUNT_IN's own derivation
    let pool_output_at_candidate = EXPECTED_AMOUNT_IN * 11_000 / 10_000;
    let pool_output_value_at_candidate = pool_output_at_candidate * 10_000_000;
    let expected_amount_in =
        EXPECTED_AMOUNT_IN * target_amount_in_value / pool_output_value_at_candidate;
    assert_eq!(amount_in, expected_amount_in);
    assert!(amount_in < EXPECTED_AMOUNT_IN, "premium pool must shrink the trade, not grow it");

    // Confirm the landing: apply the same 11_000 bps rate to the corrected
    // amount_in (what the pool would really return, per this mock's own
    // model) and check the resulting weight against target.
    let real_out = amount_in * 11_000 / 10_000;
    let new_sell_balance = SELL_BALANCE - amount_in;
    let new_buy_balance = BUY_BALANCE + real_out;
    let new_sell_value = new_sell_balance * 10_000_000;
    let new_buy_value = new_buy_balance * 10_000_000;
    let new_total_value = new_sell_value + new_buy_value;
    let new_buy_weight_bps = new_buy_value * 10_000 / new_total_value;

    let drift_from_target = new_buy_weight_bps - TARGET_BUY_WEIGHT_BPS;
    assert!(
        drift_from_target.abs() <= 50,
        "landed {new_buy_weight_bps} bps, more than 50 bps from target {TARGET_BUY_WEIGHT_BPS}"
    );
}

// Direct test of the on-chain overshoot check itself (not just the sizing
// correction above): forces the router's real swap result far past what
// sizing alone would ever produce (simulating, for example, a price move
// between this contract's pool-quote read and the swap actually
// settling), and confirms the whole rebalance reverts rather than accept
// an outcome that landed meaningfully past target.
#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn enforce_overshoot_tolerance_on_swap_result() {
    let g = setup_gate(SELL_BALANCE, BUY_BALANCE, TARGET_BUY_WEIGHT_BPS, 999, 0, 100, 0, 2_500);
    // Far more than target would ever call for: forces new_buy_weight well
    // past TARGET_BUY_WEIGHT_BPS + OVERSHOOT_TOLERANCE_BPS regardless of
    // how amount_in was sized.
    MockRouterClient::new(&g.env, &g.router).set_swap_override_out(&(EXPECTED_AMOUNT_IN * 2));
    g.rebalance();
}
