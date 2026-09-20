# rebalance-policy

A `stellar-accounts` `Policy` implementation (see the [`Policy` trait](https://github.com/OpenZeppelin/stellar-contracts/blob/main/packages/accounts/src/policies/mod.rs) in OpenZeppelin's `stellar-contracts`). This is the contract-side half of Otolith's custody model: it is attached to a context rule on a user's smart account, and it is the only thing that decides whether a proposed rebalance swap is allowed to move that account's funds.

## How it is used

A user's smart account (deployed via `stellar/smart-account-kit`, running OpenZeppelin's audited-lineage smart account contract) has a context rule with **no signers** and this policy attached. Because the rule has no signers, authorization for anything matching that rule is deferred entirely to this policy's `enforce`. That is what lets a permissionless caller trigger a rebalance with no personal signature at all: the policy is the sole gate.

Changing the policy's own parameters, or anything else about the account, is not possible through this path. `enforce` rejects any context that targets the smart account itself, and every other context that is not the exact whitelisted swap shape. Only the account owner's real signer, through a different rule, can manage the account.

## What it checks

Installed once per (smart account, context rule) with:

- `sell_asset`, `buy_asset`: the whitelisted pair and direction for this rule.
- `router`: the trusted Soroswap router address.
- `oracle`, `sell_symbol`, `buy_symbol`: the Reflector oracle and ticker symbols this rule prices the swap against.
- `slippage_tolerance_bps`: how far below the live oracle price `amount_out_min` is allowed to sit, in basis points. Range-checked at install time to 30 (Soroswap's own AMM fee; anything tighter can never pass) to 500 (5%, past which the floor stops meaningfully protecting the user).
- `target_buy_weight_bps`, `band_threshold_bps`, `min_trade_size`, `reserved_tip_bps`, `max_cost_ratio_bps`: the over-trading gate's own settings. This contract range-checks all of them at install time but only acts on the next one directly; the rest are strategy inputs `contracts/rebalancer` reads and acts on itself.
- `cooldown_secs`: the minimum time, in seconds, this contract allows between two rebalances it approves for the same rule (300 to 604800). The one over-trading setting `enforce` enforces on its own, independent of anything the rebalancer decided: the anti-spam backstop that makes a future permissionless-caller tip safe to add.

`enforce` is called once per authorization context. It recognizes exactly two shapes and rejects everything else by default:

1. A call to `router.swap_exact_tokens_for_tokens` whose path is exactly `[sell_asset, buy_asset]`, whose recipient is the smart account itself, whose timing does not land inside the `cooldown_secs` window since the last rebalance this contract approved for the rule, and whose `amount_out_min` meets a floor `enforce` derives itself from a live oracle read and `slippage_tolerance_bps`, refusing if that price is missing or older than 600 seconds, the same rule `contracts/rebalancer` applies to the same feed. Only once every other check on this shape has passed does `enforce` record the rebalance's timestamp, exactly once, advancing the cooldown.
2. A call to `sell_asset.transfer` whose sender is the smart account itself (the token movement the router triggers as part of the swap above). Never touches the cooldown timestamp: `enforce` runs once for this context too (a rebalance's router call and its nested transfer are two separate authorization contexts), and only the swap-context branch above is where the cooldown is checked or advanced.

`enforce` never calls `require_auth` on anything other than the smart account itself (the same pattern `stellar-accounts`' own spending-limit policy uses), so none of this introduces reentrancy; the calls it does make (the oracle's `lastprice`, each token's `decimals`) are plain view reads. This is compute-then-validate: by the time `enforce` runs, the rebalancer contract has already built the exact swap and called the router, but the policy does not trust that computation, it independently rederives the acceptable floor and checks the finished arguments against its own number.

## Multi-tenancy

One deployed instance of this contract can be installed on any number of users' smart accounts: storage is keyed by `(smart_account, context_rule_id)`.
