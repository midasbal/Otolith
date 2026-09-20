#![no_std]

// A stellar-accounts `Policy` implementation for Otolith rebalances.
//
// This contract is attached to a smart account's context rule (installed
// via stellar/smart-account-kit, running OpenZeppelin's stellar-accounts
// smart account). The rule it is attached to has no signers of its own: the
// rule defers authorization entirely to this policy's `enforce`, which is
// how a permissionless caller can trigger a rebalance with no personal
// signature at all. Changing the policy itself, or any other action on the
// account, still requires the account owner's real signer, because
// enforce() only ever approves a context whose contract and function match
// the stored rebalance shape; every other context is rejected by default.
//
// enforce() reads only its own storage, the context it was handed, and
// plain view calls (the Reflector oracle's lastprice, a token's decimals).
// It never calls require_auth on anything other than the smart account
// itself (the same pattern stellar-accounts' own spending-limit policy
// uses), so none of this introduces reentrancy. The rebalancer contract
// computes the exact swap and calls Soroswap first; this policy validates
// the finished swap arguments against the stored whitelist and direction,
// and independently derives its own minimum-output floor from a fresh
// oracle read rather than trusting the rebalancer's math. This is
// compute-then-validate, with the validate half checking the price itself
// as well as the swap shape.

use soroban_sdk::{
    auth::Context, contract, contractclient, contracterror, contractimpl, contracttype, token,
    Address, Env, Symbol, TryFromVal, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

// Allowed range for a rule's slippage_tolerance_bps, enforced at install
// time. 30 bps is Soroswap's own AMM fee: anything tighter guarantees every
// swap reverts, so it is not a usable setting. 500 bps (5%) is a ceiling
// past which the floor stops meaningfully protecting the user; a pair that
// genuinely needs more slack should get a fresh look, not a silently wide
// open tolerance.
const MIN_SLIPPAGE_TOLERANCE_BPS: i128 = 30;
const MAX_SLIPPAGE_TOLERANCE_BPS: i128 = 500;
const BPS_DENOMINATOR: i128 = 10_000;

// Allowed ranges for the over-trading gate's own per-rule settings,
// enforced at install time. Only cooldown_secs is actually enforced by this contract; the
// others are strategy inputs the rebalancer reads and acts on, but every
// per-user setting is validated here since install() is the one place
// configuration for a rule gets written at all.
const MIN_BAND_THRESHOLD_BPS: i128 = 10;
const MAX_BAND_THRESHOLD_BPS: i128 = 2_000;
const MAX_RESERVED_TIP_BPS: i128 = 1_000;
const MIN_MAX_COST_RATIO_BPS: i128 = 500;
const MAX_MAX_COST_RATIO_BPS: i128 = 5_000;
const MIN_COOLDOWN_SECS: u64 = 300;
const MAX_COOLDOWN_SECS: u64 = 604_800;

// min_trade_size is a raw sell_asset amount, not a bps rate, so there is no
// natural upper bound the way there is for the other gate fields. Without
// one, install() would accept anything up to i128::MAX, letting a rule be
// installed that can never actually trade, silently disabling it rather
// than failing at install time. 10^15 raw units (100 million tokens at a
// typical 7-decimal SAC) is comfortably above any real portfolio while
// still catching an obviously-wrong value.
const MAX_MIN_TRADE_SIZE: i128 = 1_000_000_000_000_000;

// Maximum age, in seconds, of an oracle price this contract will trust.
// Matches the limit the rebalancer applies to the same feed (see
// contracts/rebalancer): twice Reflector's own 300 second resolution.
const MAX_PRICE_AGE_SECS: u64 = 600;

#[contracttype]
#[derive(Clone)]
pub struct RebalancePolicyParams {
    pub sell_asset: Address,
    pub buy_asset: Address,
    pub router: Address,
    // The real Soroswap pair address for sell_asset and buy_asset,
    // derived once by install() itself via a live router_pair_for call.
    // Never trusted from the caller: install() overwrites
    // whatever value is passed in before storing. The transfer branch of
    // verify_context reads this stored value instead of calling the
    // router, since the router is always mid-execution on the call stack
    // by the time the transfer branch runs, and a live call back into it
    // from there is a reentrant call Soroban refuses unconditionally.
    pub pair: Address,
    // The Reflector oracle this rule prices the swap against, and the
    // ticker symbols for sell_asset/buy_asset on that oracle (Reflector
    // prices by symbol, not by contract address).
    pub oracle: Address,
    pub sell_symbol: Symbol,
    pub buy_symbol: Symbol,
    // How far below the live oracle price a swap's amount_out_min is
    // allowed to sit, in basis points (1% = 100 bps). The acceptable
    // minimum output is derived fresh from the oracle at enforce time, not
    // stored as a fixed rate, so it stays correct for the current market
    // without per-pair tuning.
    pub slippage_tolerance_bps: i128,
    // The over-trading gate's own settings. This contract only
    // acts on cooldown_secs; the rest are strategy inputs the rebalancer
    // reads the same way it reads slippage_tolerance_bps, and are validated
    // here purely because install() is the one place a rule's configuration
    // is written.
    //
    // Target fraction of the pair's total value (both assets priced via
    // oracle) that should be held in buy_asset, in basis points.
    pub target_buy_weight_bps: i128,
    // Minimum drift from target, in basis points, before a rebalance is
    // worth attempting at all.
    pub band_threshold_bps: i128,
    // Dust floor: a computed trade smaller than this (in sell_asset raw
    // units) is skipped rather than executed.
    pub min_trade_size: i128,
    // Reserved allowance, in basis points, for a future caller tip's cost.
    // Currently unused by any tip mechanism (there is none yet); folding it
    // into the cost estimate now means adding a real tip later needs no
    // change to the gate itself, only to what funds this allowance.
    pub reserved_tip_bps: i128,
    // How large the estimated cost of a rebalance is allowed to be,
    // relative to the value it corrects, in basis points. The backstop for
    // when a pair's own configured slippage tolerance (or a future tip) is
    // too large relative to what the drift is worth correcting.
    pub max_cost_ratio_bps: i128,
    // Minimum time, in seconds, this contract will allow between two
    // rebalances on the same rule, tracked and enforced independently of
    // anything the rebalancer computes: the anti-spam backstop that makes
    // a future permissionless-caller tip safe to add.
    pub cooldown_secs: u64,
}

// Minimal client for the parts of the Reflector oracle interface this
// contract needs. Matches contracts/rebalancer's own copy exactly (see that
// crate for the interface source). Deliberately duplicated rather than
// shared: the policy reads the oracle itself and computes its own floor
// independently of whatever the rebalancer computed, so a bug or compromise
// in one contract's price handling does not carry over into the other's.
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

// Minimal mirror of the Soroswap router client the rebalancer already uses
// for the same router, declared with a plain return type rather than the
// real remote ABI's Result-wrapped one, the same already-proven-safe
// pattern the existing RouterInterface in contracts/rebalancer uses.
// router_pair_for is a deterministic, no-external-call address derivation
// inside the router (verified against real testnet swap transfer
// destinations), used here to independently derive the one
// correct transfer destination for a whitelisted pair rather than trusting
// anything the caller supplied.
#[contractclient(name = "RouterClient")]
pub trait RouterInterface {
    fn router_pair_for(env: Env, token_a: Address, token_b: Address) -> Address;
}

fn fresh_price(
    oracle: &ReflectorClient,
    symbol: &Symbol,
    now: u64,
) -> Result<ReflectorPriceData, Error> {
    let price = oracle
        .lastprice(&ReflectorAsset::Other(symbol.clone()))
        .ok_or(Error::PriceMissing)?;

    // A future-dated timestamp is rejected outright rather than folded
    // into age via unwrap_or(0), which would otherwise treat it as
    // maximally fresh (age zero) instead of refusing an oracle read that
    // makes no sense (Finding 3, threat model).
    let age = now.checked_sub(price.timestamp).ok_or(Error::PriceStale)?;
    if age > MAX_PRICE_AGE_SECS {
        return Err(Error::PriceStale);
    }

    // A zero or negative price would silently collapse the slippage floor
    // to zero (or invert it) wherever it is used, rather than failing
    // loudly (Finding 4, threat model).
    if price.price <= 0 {
        return Err(Error::PriceInvalid);
    }

    Ok(price)
}

#[contracttype]
enum DataKey {
    // Multi-tenant: one policy contract instance can be installed on many
    // different users' smart accounts, keyed by (smart_account, context
    // rule id).
    Params(Address, u32),
    // The ledger timestamp of the last rebalance this contract approved for
    // this (smart_account, context_rule_id), written exactly once per
    // rebalance, only from the swap-context branch of verify_context.
    LastRebalance(Address, u32),
    // A single-use marker written by the swap branch of
    // verify_context once every other swap check has passed, recording the
    // approved amount_in for this (smart_account, context_rule_id). The
    // transfer branch requires a matching marker before approving the
    // token transfer that carries out the swap, and deletes it on use.
    // Temporary storage, not persistent: this marker has no reason to
    // outlive the single transaction it is written for.
    PendingTransfer(Address, u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInstalled = 1,
    AlreadyInstalled = 2,
    InvalidContext = 3,
    SelfManagementNotAllowed = 4,
    WrongRecipient = 5,
    InvalidPath = 6,
    AssetNotWhitelisted = 7,
    SlippageTooHigh = 8,
    WrongSender = 9,
    UnrecognizedContext = 10,
    BadArgs = 11,
    Overflow = 12,
    InvalidSlippageTolerance = 13,
    PriceMissing = 14,
    PriceStale = 15,
    InvalidTargetWeight = 16,
    InvalidBandThreshold = 17,
    InvalidMinTradeSize = 18,
    InvalidReservedTip = 19,
    InvalidMaxCostRatio = 20,
    InvalidCooldown = 21,
    CooldownActive = 22,
    TradeTooLarge = 23,
    WrongDestination = 24,
    NoMatchingApproval = 25,
    PriceInvalid = 26,
}

#[contract]
pub struct RebalancePolicy;

#[contractimpl]
impl RebalancePolicy {
    pub fn get_params(e: Env, smart_account: Address, context_rule_id: u32) -> RebalancePolicyParams {
        e.storage()
            .persistent()
            .get(&DataKey::Params(smart_account, context_rule_id))
            .unwrap_or_else(|| panic_with_not_installed(&e))
    }
}

fn panic_with_not_installed(e: &Env) -> ! {
    soroban_sdk::panic_with_error!(e, Error::NotInstalled)
}

fn decode_i128(e: &Env, val: &soroban_sdk::Val) -> Result<i128, Error> {
    i128::try_from_val(e, val).map_err(|_| Error::BadArgs)
}

fn decode_address(e: &Env, val: &soroban_sdk::Val) -> Result<Address, Error> {
    Address::try_from_val(e, val).map_err(|_| Error::BadArgs)
}

fn decode_path(e: &Env, val: &soroban_sdk::Val) -> Result<Vec<Address>, Error> {
    Vec::<Address>::try_from_val(e, val).map_err(|_| Error::BadArgs)
}

fn verify_context(
    e: &Env,
    context: &Context,
    smart_account: &Address,
    context_rule_id: u32,
    params: &RebalancePolicyParams,
) -> Result<(), Error> {
    let c = match context {
        Context::Contract(c) => c,
        Context::CreateContractHostFn(_) => return Err(Error::InvalidContext),
        Context::CreateContractWithCtorHostFn(_) => return Err(Error::InvalidContext),
    };

    if &c.contract == smart_account {
        // A context targeting the smart account itself (changing context
        // rules, installing policies, and so on) is never approved through
        // this policy, no matter what it is. Only the account's own real
        // signer, on a different rule, can manage the account.
        return Err(Error::SelfManagementNotAllowed);
    }

    let swap_fn = Symbol::new(e, "swap_exact_tokens_for_tokens");
    let transfer_fn = Symbol::new(e, "transfer");

    if c.contract == params.router && c.fn_name == swap_fn {
        let amount_in = decode_i128(e, &c.args.get(0).ok_or(Error::BadArgs)?)?;
        let amount_out_min = decode_i128(e, &c.args.get(1).ok_or(Error::BadArgs)?)?;
        let path = decode_path(e, &c.args.get(2).ok_or(Error::BadArgs)?)?;
        let to = decode_address(e, &c.args.get(3).ok_or(Error::BadArgs)?)?;

        if &to != smart_account {
            return Err(Error::WrongRecipient);
        }
        if path.len() != 2 {
            return Err(Error::InvalidPath);
        }
        let sell = path.get(0).ok_or(Error::InvalidPath)?;
        let buy = path.get(1).ok_or(Error::InvalidPath)?;
        if sell != params.sell_asset || buy != params.buy_asset {
            return Err(Error::AssetNotWhitelisted);
        }

        // Cooldown backstop: independent of anything the
        // rebalancer decided, this contract refuses a rebalance that would
        // land inside the configured cooldown window since the last one it
        // approved for this rule. Checked before the oracle reads below so
        // a caller spamming this path fails cheaply.
        let now = e.ledger().timestamp();
        let last_key = DataKey::LastRebalance(smart_account.clone(), context_rule_id);
        if let Some(last) = e.storage().persistent().get::<_, u64>(&last_key) {
            let elapsed = now.checked_sub(last).unwrap_or(0);
            if elapsed < params.cooldown_secs {
                return Err(Error::CooldownActive);
            }
        }

        // Independently derive the acceptable minimum output from a live
        // oracle read, rather than trusting the amount_out_min the
        // rebalancer already computed. Same missing/stale refusal rule the
        // rebalancer applies to the same feed: a wrong or absent price is
        // worse than no rebalance, so this rejects rather than falling back
        // to anything.
        let oracle_client = ReflectorClient::new(e, &params.oracle);
        let sell_price = fresh_price(&oracle_client, &params.sell_symbol, now)?;
        let buy_price = fresh_price(&oracle_client, &params.buy_symbol, now)?;

        let sell_decimals = token::Client::new(e, &sell).decimals();
        let buy_decimals = token::Client::new(e, &buy).decimals();

        // Independent maximum on amount_in: the same oracle-only
        // ideal size contracts/rebalancer computes as its own starting
        // candidate before its own pool-quote correction, which only ever
        // shrinks the trade further, never grows it. So this is always a
        // safe ceiling on whatever a legitimate rebalance actually submits,
        // computed here from live balances this contract reads itself, not
        // trusted from the caller. A caller that skips the rebalancer and
        // calls the router directly can never submit more than a fully
        // justified, complete-drift-closing rebalance could ever need.
        let sell_balance = token::Client::new(e, &sell).balance(smart_account);
        let buy_balance = token::Client::new(e, &buy).balance(smart_account);
        let max_amount_in = match rebalance_sizing::ideal_amount_in(
            params.target_buy_weight_bps,
            sell_balance,
            buy_balance,
            sell_price.price,
            buy_price.price,
            sell_decimals,
            buy_decimals,
        ) {
            Ok(amount) => amount,
            Err(rebalance_sizing::SizingError::NotActionable) => 0,
            Err(rebalance_sizing::SizingError::Overflow) => return Err(Error::Overflow),
        };
        if amount_in > max_amount_in {
            return Err(Error::TradeTooLarge);
        }

        let numerator = amount_in
            .checked_mul(sell_price.price)
            .ok_or(Error::Overflow)?;
        let mut expected_out = numerator
            .checked_div(buy_price.price)
            .ok_or(Error::Overflow)?;

        if buy_decimals > sell_decimals {
            let scale = 10i128.pow(buy_decimals - sell_decimals);
            expected_out = expected_out.checked_mul(scale).ok_or(Error::Overflow)?;
        } else if sell_decimals > buy_decimals {
            let scale = 10i128.pow(sell_decimals - buy_decimals);
            expected_out = expected_out.checked_div(scale).ok_or(Error::Overflow)?;
        }

        // Rounded up (ceiling division), not down: this is a protective
        // minimum, and rounding down would make the enforced floor
        // slightly looser than the configured tolerance implies (Finding
        // 5, threat model). Contrast with the trade-size division above,
        // which rounds down deliberately, since the conservative direction
        // there is moving less, not enforcing a stricter minimum.
        let floor_numerator = expected_out
            .checked_mul(BPS_DENOMINATOR - params.slippage_tolerance_bps)
            .ok_or(Error::Overflow)?;
        let floor = floor_numerator
            .checked_add(BPS_DENOMINATOR - 1)
            .ok_or(Error::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(Error::Overflow)?;

        if amount_out_min < floor {
            return Err(Error::SlippageTooHigh);
        }

        // Every other check for this rebalance has passed. Record the
        // cooldown now, once, only here: the transfer-context branch below
        // never touches this key, so a single rebalance (one swap context,
        // one nested transfer context) advances the cooldown exactly once.
        // If the transaction fails for any other reason after this point,
        // Soroban only commits state on success, so this write does not
        // stick either.
        e.storage().persistent().set(&last_key, &now);

        // A single-use marker: the transfer branch below cannot
        // see this context, so it cannot know on its own that a matching,
        // already-approved swap exists. do_check_auth enforces contexts in
        // the order they appear in the same authorization, and the nested
        // transfer only comes into existence as a sub-invocation of this
        // swap's own execution, so this write is guaranteed to happen
        // before the transfer branch runs for a genuine rebalance, never
        // after. Temporary storage, not persistent: this marker has no
        // reason to outlive the single transaction it is written for, and
        // using the shortest-lived storage type available bounds how long
        // a stray, unconsumed marker could ever exist even in a scenario
        // this design did not anticipate.
        let pending_key = DataKey::PendingTransfer(smart_account.clone(), context_rule_id);
        e.storage().temporary().set(&pending_key, &amount_in);
        return Ok(());
    }

    if c.contract == params.sell_asset && c.fn_name == transfer_fn {
        let from = decode_address(e, &c.args.get(0).ok_or(Error::BadArgs)?)?;
        let to = decode_address(e, &c.args.get(1).ok_or(Error::BadArgs)?)?;
        let amount = decode_i128(e, &c.args.get(2).ok_or(Error::BadArgs)?)?;

        if &from != smart_account {
            return Err(Error::WrongSender);
        }

        // The transfer's destination must be the real Soroswap pair for
        // this whitelisted pair, the address install() itself derived from
        // a live router_pair_for call and stored, not trusted from
        // anything the caller or the rebalancer supplied. Read here rather
        // than queried live: by the time this branch runs, the router is
        // always still mid-execution on the call stack (that is what
        // triggered this nested transfer authorization in the first
        // place), so a live call back into it here would be a reentrant
        // call Soroban refuses unconditionally (confirmed on real testnet).
        if to != params.pair {
            return Err(Error::WrongDestination);
        }

        // A destination check alone is not enough: Soroswap's own pair
        // contract exposes a permissionless skim function that sends any
        // balance in excess of tracked reserves to whoever calls it, so a
        // correctly destined but otherwise unaccompanied transfer is still
        // a real, if bounded, leak. This transfer is only
        // approved if it consumes a marker the swap branch above wrote for
        // this exact rule, for this exact amount, earlier in the same
        // authorization. A standalone transfer, with no matching swap
        // context anywhere in this transaction, never has a marker to
        // consume and is rejected here.
        let pending_key = DataKey::PendingTransfer(smart_account.clone(), context_rule_id);
        let approved_amount: i128 = e
            .storage()
            .temporary()
            .get(&pending_key)
            .ok_or(Error::NoMatchingApproval)?;
        if amount != approved_amount {
            return Err(Error::NoMatchingApproval);
        }
        e.storage().temporary().remove(&pending_key);
        return Ok(());
    }

    Err(Error::UnrecognizedContext)
}

#[contractimpl]
impl Policy for RebalancePolicy {
    type AccountParams = RebalancePolicyParams;

    fn install(
        e: &Env,
        install_params: RebalancePolicyParams,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();

        if install_params.slippage_tolerance_bps < MIN_SLIPPAGE_TOLERANCE_BPS
            || install_params.slippage_tolerance_bps > MAX_SLIPPAGE_TOLERANCE_BPS
        {
            soroban_sdk::panic_with_error!(e, Error::InvalidSlippageTolerance);
        }
        if install_params.target_buy_weight_bps < 0 || install_params.target_buy_weight_bps > BPS_DENOMINATOR
        {
            soroban_sdk::panic_with_error!(e, Error::InvalidTargetWeight);
        }
        if install_params.band_threshold_bps < MIN_BAND_THRESHOLD_BPS
            || install_params.band_threshold_bps > MAX_BAND_THRESHOLD_BPS
        {
            soroban_sdk::panic_with_error!(e, Error::InvalidBandThreshold);
        }
        if install_params.min_trade_size < 0 || install_params.min_trade_size > MAX_MIN_TRADE_SIZE {
            soroban_sdk::panic_with_error!(e, Error::InvalidMinTradeSize);
        }
        if install_params.reserved_tip_bps < 0 || install_params.reserved_tip_bps > MAX_RESERVED_TIP_BPS {
            soroban_sdk::panic_with_error!(e, Error::InvalidReservedTip);
        }
        if install_params.max_cost_ratio_bps < MIN_MAX_COST_RATIO_BPS
            || install_params.max_cost_ratio_bps > MAX_MAX_COST_RATIO_BPS
        {
            soroban_sdk::panic_with_error!(e, Error::InvalidMaxCostRatio);
        }
        if install_params.cooldown_secs < MIN_COOLDOWN_SECS || install_params.cooldown_secs > MAX_COOLDOWN_SECS {
            soroban_sdk::panic_with_error!(e, Error::InvalidCooldown);
        }

        let key = DataKey::Params(smart_account.clone(), context_rule.id);
        if e.storage().persistent().has(&key) {
            soroban_sdk::panic_with_error!(e, Error::AlreadyInstalled);
        }

        // Derived here, not trusted from the caller: install()
        // is owner driven and never runs while a swap is in progress, so
        // the router is never on the call stack at this point, and this
        // call is not reentrant.
        let router_client = RouterClient::new(e, &install_params.router);
        let pair = router_client.router_pair_for(&install_params.sell_asset, &install_params.buy_asset);
        let mut stored_params = install_params;
        stored_params.pair = pair;

        e.storage().persistent().set(&key, &stored_params);
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();

        let key = DataKey::Params(smart_account, context_rule.id);
        if !e.storage().persistent().has(&key) {
            panic_with_not_installed(e);
        }
        e.storage().persistent().remove(&key);
    }

    fn enforce(
        e: &Env,
        context: Context,
        _authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        smart_account.require_auth();

        let params: RebalancePolicyParams = e
            .storage()
            .persistent()
            .get(&DataKey::Params(smart_account.clone(), context_rule.id))
            .unwrap_or_else(|| panic_with_not_installed(e));

        if let Err(error) = verify_context(e, &context, &smart_account, context_rule.id, &params) {
            soroban_sdk::panic_with_error!(e, error);
        }
    }
}

mod test;
