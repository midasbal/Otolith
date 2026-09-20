#![no_std]

// Shared by contracts/rebalancer and contracts/rebalance-policy for exactly
// one computation: the oracle-only ideal trade size, the value a rebalance
// would need to move to close all drift from target, priced against a live
// oracle read alone, with no pool quote involved.
//
// This crate has no dependency on soroban-sdk and no contract-facing
// surface at all: no contract macros, no contractclient, nothing that
// generates a contract spec. Depending on it does not fold anything into
// either contract's exported wasm interface, unlike the earlier mistake of
// depending on a full contract crate, which pulled that crate's whole spec
// along with it.
//
// The rebalancer uses this as the starting candidate before its own live
// pool quote correction, which only ever shrinks the trade further. The
// policy uses the same function, independently, as a maximum bound on
// amount_in: since the rebalancer's real, pool-corrected size is always
// at or under this oracle-only ideal, the policy never rejects a
// legitimate rebalance by checking against it.
//
// This function must stay pure: no I/O, no cross-contract calls, no
// require_auth, nothing that could change the risk profile of being called
// from inside a policy's enforce(), which runs inside the account's
// authorization path.

const BPS_DENOMINATOR: i128 = 10_000;

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SizingError {
    // An intermediate multiplication or division could not be completed
    // without overflowing i128, or a price was not positive.
    Overflow,
    // The account is already at or past target, or within reach of it: no
    // trade in the sell to buy direction would move it further toward
    // target, so there is nothing to size.
    NotActionable,
}

// Value of a raw balance in the oracle's own price scale: balance times
// price divided by ten to the power of the asset's own decimals. Both
// assets priced by the same oracle, so a sell and buy value computed this
// way are directly comparable and addable.
fn asset_value(balance: i128, price: i128, decimals: u32) -> Result<i128, SizingError> {
    if price <= 0 {
        return Err(SizingError::Overflow);
    }
    let scale = 10i128
        .checked_pow(decimals)
        .ok_or(SizingError::Overflow)?;
    balance
        .checked_mul(price)
        .ok_or(SizingError::Overflow)?
        .checked_div(scale)
        .ok_or(SizingError::Overflow)
}

/// The oracle-only ideal amount of sell_asset a rebalance would move to
/// bring buy_weight to exactly target_buy_weight_bps, with no pool quote
/// correction, no fee, no slippage. Both balances are raw token units;
/// both prices are the oracle's own price scale (same oracle, same scale,
/// for both assets); both decimals are each asset's own reported decimals.
///
/// target_buy_weight_bps must be between 0 and 10000 inclusive. This is
/// not re-validated here: both callers already read it from a range
/// checked at install time.
pub fn ideal_amount_in(
    target_buy_weight_bps: i128,
    sell_balance: i128,
    buy_balance: i128,
    sell_price: i128,
    buy_price: i128,
    sell_decimals: u32,
    buy_decimals: u32,
) -> Result<i128, SizingError> {
    let sell_value = asset_value(sell_balance, sell_price, sell_decimals)?;
    let buy_value = asset_value(buy_balance, buy_price, buy_decimals)?;

    let d_minus_t = BPS_DENOMINATOR - target_buy_weight_bps;
    let term1 = target_buy_weight_bps
        .checked_mul(sell_value)
        .ok_or(SizingError::Overflow)?;
    let term2 = d_minus_t
        .checked_mul(buy_value)
        .ok_or(SizingError::Overflow)?;
    let target_value = term1
        .checked_sub(term2)
        .ok_or(SizingError::Overflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(SizingError::Overflow)?;

    if target_value <= 0 {
        return Err(SizingError::NotActionable);
    }

    let sell_scale = 10i128
        .checked_pow(sell_decimals)
        .ok_or(SizingError::Overflow)?;
    target_value
        .checked_mul(sell_scale)
        .ok_or(SizingError::Overflow)?
        .checked_div(sell_price)
        .ok_or(SizingError::Overflow)
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;

    const PRICE_PARITY: i128 = 100_000_000_000_000;

    #[test]
    fn moves_half_of_a_fully_sell_side_portfolio_to_reach_fifty_fifty() {
        let amount_in =
            ideal_amount_in(5_000, 1_000_0000000, 0, PRICE_PARITY, PRICE_PARITY, 7, 7).unwrap();
        assert_eq!(amount_in, 500_0000000);
    }

    #[test]
    fn moves_a_tenth_to_reach_a_ten_percent_target_from_zero() {
        let amount_in =
            ideal_amount_in(1_000, 1_000_0000000, 0, PRICE_PARITY, PRICE_PARITY, 7, 7).unwrap();
        assert_eq!(amount_in, 100_0000000);
    }

    #[test]
    fn not_actionable_when_already_at_target() {
        // 500 sell, 500 buy at parity: exactly 50 percent already.
        let err =
            ideal_amount_in(5_000, 500_0000000, 500_0000000, PRICE_PARITY, PRICE_PARITY, 7, 7)
                .unwrap_err();
        assert_eq!(err, SizingError::NotActionable);
    }

    #[test]
    fn not_actionable_when_already_past_target() {
        let err =
            ideal_amount_in(1_000, 0, 1_000_0000000, PRICE_PARITY, PRICE_PARITY, 7, 7).unwrap_err();
        assert_eq!(err, SizingError::NotActionable);
    }

    #[test]
    fn handles_asymmetric_decimals_and_prices() {
        // sell priced higher than buy, and different decimals, still
        // produces a positive, sane amount.
        let amount_in = ideal_amount_in(
            1_000,
            1_000_0000000,
            0,
            155_000_000_000_000,
            100_000_000_000_000,
            7,
            18,
        )
        .unwrap();
        assert!(amount_in > 0);
    }

    #[test]
    fn rejects_zero_price() {
        let err = ideal_amount_in(1_000, 1_000_0000000, 0, 0, PRICE_PARITY, 7, 7).unwrap_err();
        assert_eq!(err, SizingError::Overflow);
    }
}
