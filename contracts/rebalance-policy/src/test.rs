#![cfg(test)]
extern crate std;

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contractimpl, token,
    testutils::{Address as _, Ledger},
    vec, Address, Env, IntoVal, Map, Symbol,
};
use stellar_accounts::policies::Policy;
use stellar_accounts::smart_account::{ContextRule, ContextRuleType, Signer};

use crate::{RebalancePolicy, RebalancePolicyParams, ReflectorAsset, ReflectorPriceData};

#[contract]
struct MockAccount;

// A minimal mock Reflector oracle for local tests, matching the one
// contracts/rebalancer's own tests use. Real behavior is proven on testnet
// against the real oracle; this mock only needs to return whatever price
// and timestamp a test sets.
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

// A minimal mock Soroswap router for local tests: only implements
// router_pair_for, the one router function verify_context's transfer
// branch calls. Real behavior (that router_pair_for is
// deterministic and matches the real swap's own transfer destination) is
// proven on testnet against the real router; this mock only needs to
// return whatever pair address a test configures.
#[contract]
struct MockRouter;

#[contractimpl]
impl MockRouter {
    pub fn set_pair(env: Env, pair: Address) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "pair"), &pair);
    }

    pub fn router_pair_for(env: Env, _token_a: Address, _token_b: Address) -> Address {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "pair"))
            .unwrap()
    }
}

fn create_context_rule(e: &Env, id: u32) -> ContextRule {
    ContextRule {
        id,
        context_type: ContextRuleType::Default,
        name: soroban_sdk::String::from_str(e, "rebalance"),
        signers: soroban_sdk::Vec::<Signer>::new(e),
        signer_ids: soroban_sdk::Vec::new(e),
        policies: soroban_sdk::Vec::new(e),
        policy_ids: soroban_sdk::Vec::new(e),
        valid_until: None,
    }
}

// Sensible defaults for the over-trading gate's own fields, used by every
// test that is not specifically exercising one of them. None of these are
// read by verify_context's swap-context math except cooldown_secs: the
// rest are strategy inputs the rebalancer alone acts on.
const DEFAULT_TARGET_BUY_WEIGHT_BPS: i128 = 5_000;
const DEFAULT_BAND_THRESHOLD_BPS: i128 = 200;
const DEFAULT_MIN_TRADE_SIZE: i128 = 0;
const DEFAULT_RESERVED_TIP_BPS: i128 = 0;
const DEFAULT_MAX_COST_RATIO_BPS: i128 = 2_500;
const DEFAULT_COOLDOWN_SECS: u64 = 3_600;

fn create_params(f: &Fixture, slippage_tolerance_bps: i128) -> RebalancePolicyParams {
    create_params_full(f, slippage_tolerance_bps, DEFAULT_COOLDOWN_SECS)
}

fn create_params_full(f: &Fixture, slippage_tolerance_bps: i128, cooldown_secs: u64) -> RebalancePolicyParams {
    RebalancePolicyParams {
        sell_asset: f.sell.clone(),
        buy_asset: f.buy.clone(),
        router: f.router.clone(),
        // install() derives and overwrites this itself via a live
        // router_pair_for call, so this value never actually
        // reaches storage. Set to a different address than the real pair
        // to make that overwrite observable, rather than a value that
        // would pass a comparison either way.
        pair: Address::generate(&f.e),
        oracle: f.oracle.clone(),
        sell_symbol: f.sell_symbol.clone(),
        buy_symbol: f.buy_symbol.clone(),
        slippage_tolerance_bps,
        target_buy_weight_bps: DEFAULT_TARGET_BUY_WEIGHT_BPS,
        band_threshold_bps: DEFAULT_BAND_THRESHOLD_BPS,
        min_trade_size: DEFAULT_MIN_TRADE_SIZE,
        reserved_tip_bps: DEFAULT_RESERVED_TIP_BPS,
        max_cost_ratio_bps: DEFAULT_MAX_COST_RATIO_BPS,
        cooldown_secs,
    }
}

fn swap_context(
    e: &Env,
    router: &Address,
    to: &Address,
    amount_in: i128,
    amount_out_min: i128,
    sell: &Address,
    buy: &Address,
) -> Context {
    let path = vec![e, sell.clone(), buy.clone()];
    Context::Contract(ContractContext {
        contract: router.clone(),
        fn_name: Symbol::new(e, "swap_exact_tokens_for_tokens"),
        args: (amount_in, amount_out_min, path, to.clone(), 9_999_999_999u64).into_val(e),
    })
}

fn transfer_context(e: &Env, token: &Address, from: &Address, to: &Address, amount: i128) -> Context {
    Context::Contract(ContractContext {
        contract: token.clone(),
        fn_name: Symbol::new(e, "transfer"),
        args: (from.clone(), to.clone(), amount).into_val(e),
    })
}

struct Fixture {
    e: Env,
    policy: Address,
    smart_account: Address,
    sell: Address,
    buy: Address,
    router: Address,
    pair: Address,
    oracle: Address,
    sell_symbol: Symbol,
    buy_symbol: Symbol,
}

impl Fixture {
    fn install(&self, rule: &ContextRule, params: &RebalancePolicyParams) {
        let e = &self.e;
        let policy = self.policy.clone();
        let rule = rule.clone();
        let params = params.clone();
        let smart_account = self.smart_account.clone();
        e.as_contract(&policy, || {
            RebalancePolicy::install(e, params, rule, smart_account);
        });
    }

    fn enforce(&self, rule: &ContextRule, context: Context) {
        let e = &self.e;
        let policy = self.policy.clone();
        let rule = rule.clone();
        let smart_account = self.smart_account.clone();
        e.as_contract(&policy, || {
            RebalancePolicy::enforce(e, context, soroban_sdk::Vec::new(e), rule, smart_account);
        });
    }

    fn get_params(&self, rule: &ContextRule) -> RebalancePolicyParams {
        let e = &self.e;
        let policy = self.policy.clone();
        let smart_account = self.smart_account.clone();
        let rule_id = rule.id;
        e.as_contract(&policy, || RebalancePolicy::get_params(e.clone(), smart_account, rule_id))
    }

    fn set_price(&self, symbol: &Symbol, price: i128, timestamp: u64) {
        let e = &self.e;
        e.as_contract(&self.oracle, || {
            MockOracle::set_price(e.clone(), symbol.clone(), price, timestamp);
        });
    }
}

const NOW: u64 = 1_700_000_000u64;

fn setup() -> Fixture {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_timestamp(NOW);

    let policy = e.register(RebalancePolicy, ());
    let smart_account = e.register(MockAccount, ());
    let oracle = e.register(MockOracle, ());
    let router = e.register(MockRouter, ());
    let pair = Address::generate(&e);
    e.as_contract(&router, || {
        MockRouter::set_pair(e.clone(), pair.clone());
    });

    // Real SAC tokens, not bare generated addresses: enforce() now calls
    // each asset's own decimals(), so the fixture needs real token contracts
    // to call, the same as the real Reflector-priced pairs on testnet.
    let sell = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    let buy = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();

    // A generous sell-side balance and no buy-side balance, held by the
    // smart account itself: enforce() now reads live balances to derive
    // its own independent size ceiling, so tests need a real
    // starting position, not just prices. Comfortably above anything any
    // test trades, so it never itself becomes the binding constraint
    // except in the test that specifically exercises it.
    let sell_symbol = Symbol::new(&e, "XLM");
    let buy_symbol = Symbol::new(&e, "USDC");
    token::StellarAssetClient::new(&e, &sell).mint(&smart_account, &10_000_000_0000000i128);

    Fixture {
        e,
        policy,
        smart_account,
        sell,
        buy,
        router,
        pair,
        oracle,
        sell_symbol,
        buy_symbol,
    }
}

// Sell and buy priced at parity (same oracle value for both), so
// expected_out == amount_in exactly: both SACs use 7 decimals, and a 1:1
// price ratio needs no scaling. Keeps the boundary math in these tests easy
// to check by hand.
fn set_parity_prices(f: &Fixture) {
    f.set_price(&f.sell_symbol, 100_000_000_000_000, NOW - 10);
    f.set_price(&f.buy_symbol, 100_000_000_000_000, NOW - 10);
}

#[test]
fn install_then_get_params() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let params = create_params(&f, 100);

    f.install(&rule, &params);

    let read = f.get_params(&rule);
    assert_eq!(read.sell_asset, f.sell);
    assert_eq!(read.buy_asset, f.buy);
    assert_eq!(read.router, f.router);
    // install() derives this itself via a live router_pair_for call and
    // overwrites whatever create_params supplied (a deliberately different
    // address), rather than trusting the caller.
    assert_eq!(read.pair, f.pair);
    assert_eq!(read.oracle, f.oracle);
    assert_eq!(read.sell_symbol, f.sell_symbol);
    assert_eq!(read.buy_symbol, f.buy_symbol);
    assert_eq!(read.slippage_tolerance_bps, 100);
    assert_eq!(read.target_buy_weight_bps, DEFAULT_TARGET_BUY_WEIGHT_BPS);
    assert_eq!(read.band_threshold_bps, DEFAULT_BAND_THRESHOLD_BPS);
    assert_eq!(read.min_trade_size, DEFAULT_MIN_TRADE_SIZE);
    assert_eq!(read.reserved_tip_bps, DEFAULT_RESERVED_TIP_BPS);
    assert_eq!(read.max_cost_ratio_bps, DEFAULT_MAX_COST_RATIO_BPS);
    assert_eq!(read.cooldown_secs, DEFAULT_COOLDOWN_SECS);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn install_twice_fails() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let params = create_params(&f, 100);

    f.install(&rule, &params);
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn uninstall_removes_params() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let params = create_params(&f, 100);

    f.install(&rule, &params);

    let e = &f.e;
    let policy = f.policy.clone();
    let rule_for_uninstall = rule.clone();
    let smart_account = f.smart_account.clone();
    e.as_contract(&policy, || {
        RebalancePolicy::uninstall(e, rule_for_uninstall, smart_account);
    });

    // Reading params again after uninstall should panic with NotInstalled.
    f.get_params(&rule);
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn install_rejects_tolerance_below_min() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let params = create_params(&f, 29);

    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn install_rejects_tolerance_above_max() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let params = create_params(&f, 501);

    f.install(&rule, &params);
}

#[test]
fn install_accepts_tolerance_at_range_boundaries() {
    let f = setup();

    let rule_low = create_context_rule(&f.e, 1);
    f.install(&rule_low, &create_params(&f, 30));
    assert_eq!(f.get_params(&rule_low).slippage_tolerance_bps, 30);

    let rule_high = create_context_rule(&f.e, 2);
    f.install(&rule_high, &create_params(&f, 500));
    assert_eq!(f.get_params(&rule_high).slippage_tolerance_bps, 500);
}

#[test]
#[should_panic(expected = "Error(Contract, #17)")]
fn install_rejects_band_threshold_below_min() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let mut params = create_params(&f, 100);
    params.band_threshold_bps = 9;
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #17)")]
fn install_rejects_band_threshold_above_max() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let mut params = create_params(&f, 100);
    params.band_threshold_bps = 2_001;
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #16)")]
fn install_rejects_target_weight_out_of_range() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let mut params = create_params(&f, 100);
    params.target_buy_weight_bps = 10_001;
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #18)")]
fn install_rejects_negative_min_trade_size() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let mut params = create_params(&f, 100);
    params.min_trade_size = -1;
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #18)")]
fn install_rejects_min_trade_size_above_max() {
    // Hygiene finding: min_trade_size previously had no upper bound, so a
    // value near i128::MAX would install a rule that can never actually
    // trade, silently disabling it rather than failing at install time.
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let mut params = create_params(&f, 100);
    params.min_trade_size = crate::MAX_MIN_TRADE_SIZE + 1;
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #19)")]
fn install_rejects_reserved_tip_above_max() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let mut params = create_params(&f, 100);
    params.reserved_tip_bps = 1_001;
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #20)")]
fn install_rejects_max_cost_ratio_below_min() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let mut params = create_params(&f, 100);
    params.max_cost_ratio_bps = 499;
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #20)")]
fn install_rejects_max_cost_ratio_above_max() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let mut params = create_params(&f, 100);
    params.max_cost_ratio_bps = 5_001;
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #21)")]
fn install_rejects_cooldown_below_min() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let params = create_params_full(&f, 100, 299);
    f.install(&rule, &params);
}

#[test]
#[should_panic(expected = "Error(Contract, #21)")]
fn install_rejects_cooldown_above_max() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    let params = create_params_full(&f, 100, 604_801);
    f.install(&rule, &params);
}

#[test]
fn install_accepts_new_gate_params_at_range_boundaries() {
    let f = setup();

    let mut low = create_params(&f, 100);
    low.target_buy_weight_bps = 0;
    low.band_threshold_bps = 10;
    low.min_trade_size = 0;
    low.reserved_tip_bps = 0;
    low.max_cost_ratio_bps = 500;
    low.cooldown_secs = 300;
    let rule_low = create_context_rule(&f.e, 1);
    f.install(&rule_low, &low);

    let mut high = create_params(&f, 100);
    high.target_buy_weight_bps = 10_000;
    high.band_threshold_bps = 2_000;
    high.reserved_tip_bps = 1_000;
    high.max_cost_ratio_bps = 5_000;
    high.cooldown_secs = 604_800;
    let rule_high = create_context_rule(&f.e, 2);
    f.install(&rule_high, &high);
}

#[test]
fn enforce_approves_valid_rebalance() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));
    set_parity_prices(&f);

    // 1% tolerance on a 1:1 price: floor is 99% of amount_in. 99.5% clears
    // it comfortably.
    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 995_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);

    let transfer = transfer_context(&f.e, &f.sell, &f.smart_account, &f.pair, 1_000_0000000);
    f.enforce(&rule, transfer);
}

#[test]
#[should_panic(expected = "Error(Contract, #25)")]
fn enforce_rejects_standalone_transfer_with_no_matching_swap() {
    // A bare transfer context, with no accompanying swap in the same
    // authorization, used to pass because verify_context's transfer
    // branch only ever checked who the funds moved from. The
    // single-use marker written by the swap branch closes this: with
    // no swap branch having run first, there is no marker for this
    // transfer to consume.
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));

    let transfer = transfer_context(&f.e, &f.sell, &f.smart_account, &f.pair, 1_000_0000000);
    f.enforce(&rule, transfer);
}

#[test]
#[should_panic(expected = "Error(Contract, #23)")]
fn enforce_rejects_oversized_direct_router_swap() {
    // Calling the router directly with an amount_in far beyond what the
    // over-trading gate would ever justify used to pass every check the
    // swap branch ran, since none of them bounded amount_in itself. An
    // independent maximum, derived from live balances rather than
    // trusted from the caller, now rejects it before the slippage floor
    // is even reached.
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));
    set_parity_prices(&f);

    // Fixture holds 10_000_000_0000000 sell, 0 buy, 50% target: the
    // oracle-only ideal ceiling is half that. Ask for far more.
    let swap = swap_context(
        &f.e,
        &f.router,
        &f.smart_account,
        9_000_000_0000000,
        1_0000000,
        &f.sell,
        &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn enforce_rejects_non_whitelisted_asset() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));
    let not_whitelisted = Address::generate(&f.e);

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 950_0000000, &f.sell, &not_whitelisted,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn enforce_rejects_slippage_breach() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));
    set_parity_prices(&f);

    // Floor is 99% of amount_in. Ask for far less than that.
    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 500_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
fn enforce_accepts_trade_just_inside_tolerance() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));
    set_parity_prices(&f);

    // amount_in = 1_000_0000000, 1% tolerance, floor = 990_0000000 exactly.
    // Asking for exactly the floor should pass (the check is inclusive).
    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn enforce_rejects_trade_just_outside_tolerance() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));
    set_parity_prices(&f);

    // One stroop below the floor computed above.
    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 989_9999999, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #15)")]
fn enforce_rejects_stale_price() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));

    f.set_price(&f.sell_symbol, 100_000_000_000_000, NOW - 10);
    // Older than the 600 second staleness limit.
    f.set_price(&f.buy_symbol, 100_000_000_000_000, NOW - 700);

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn enforce_rejects_missing_price() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));

    f.set_price(&f.sell_symbol, 100_000_000_000_000, NOW - 10);
    // No price set for buy_symbol at all, matching a real asset the oracle
    // has no feed for.

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #15)")]
fn enforce_rejects_future_price() {
    // Finding 3 (threat model): a timestamp strictly in the future used to
    // be folded into age via unwrap_or(0), treating it as maximally fresh
    // instead of refusing an oracle read that makes no sense.
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));

    f.set_price(&f.sell_symbol, 100_000_000_000_000, NOW - 10);
    // One second ahead of the current ledger timestamp.
    f.set_price(&f.buy_symbol, 100_000_000_000_000, NOW + 1);

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #26)")]
fn enforce_rejects_zero_price() {
    // Finding 4 (threat model): a zero or negative oracle price used to
    // pass the freshness check silently, collapsing the slippage floor to
    // zero instead of failing loudly.
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));

    f.set_price(&f.sell_symbol, 0, NOW - 10);
    f.set_price(&f.buy_symbol, 100_000_000_000_000, NOW - 10);

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn enforce_rejects_amount_out_min_at_old_floor_rounding() {
    // Finding 5 (threat model): the slippage floor now rounds up, not
    // down. amount_in is chosen so the floor's division is not exact; the
    // value the old floor-rounding behavior would have accepted must now
    // be rejected as one unit short of the true, rounded-up floor.
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));
    set_parity_prices(&f);

    let amount_in = 10_000_000_001i128;
    let numerator = amount_in * (10_000 - 100);
    let old_floor = numerator / 10_000;
    let new_floor = (numerator + 10_000 - 1) / 10_000;
    assert_ne!(old_floor, new_floor, "test setup must exercise a non-exact division");

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, amount_in, old_floor, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}

#[test]
#[should_panic(expected = "Error(Contract, #22)")]
fn enforce_rejects_within_cooldown() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params_full(&f, 100, 3_600));
    set_parity_prices(&f);

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);

    // Immediately try again, same rule, no time elapsed: still inside the
    // 3600 second cooldown the first rebalance started.
    let swap_again = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap_again);
}

#[test]
fn enforce_allows_after_cooldown_elapses() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params_full(&f, 100, 3_600));
    set_parity_prices(&f);

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);

    // Advance past the cooldown window, refresh the price so it is still
    // considered fresh at the new timestamp, and confirm the second
    // rebalance is now allowed.
    let later = NOW + 3_601;
    f.e.ledger().set_timestamp(later);
    f.set_price(&f.sell_symbol, 100_000_000_000_000, later - 10);
    f.set_price(&f.buy_symbol, 100_000_000_000_000, later - 10);

    let swap_again = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 990_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap_again);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn enforce_rejects_self_management() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);
    f.install(&rule, &create_params(&f, 100));

    let self_call = Context::Contract(ContractContext {
        contract: f.smart_account.clone(),
        fn_name: Symbol::new(&f.e, "add_context_rule"),
        args: soroban_sdk::Vec::new(&f.e),
    });
    f.enforce(&rule, self_call);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn enforce_without_install_fails() {
    let f = setup();
    let rule = create_context_rule(&f.e, 1);

    let swap = swap_context(
        &f.e, &f.router, &f.smart_account, 1_000_0000000, 950_0000000, &f.sell, &f.buy,
    );
    f.enforce(&rule, swap);
}
