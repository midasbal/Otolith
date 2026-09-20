# Otolith

A non-custodial, on-chain portfolio auto-rebalancer on Stellar.

You choose a target allocation, for example 80% XLM and 20% USDC, and sign it once with a passkey. Otolith then keeps your portfolio aligned to that target automatically. Your funds never leave your own account, and you can remove the automation's permission at any time.

**Live demo:** https://otolith.vercel.app
**Network:** Stellar Testnet

## The problem

Holding a target allocation usually forces a choice. You either rebalance by hand, watching prices and placing trades yourself, or you hand your assets to a custodian and trust them to do it. The first is tedious and easy to get wrong. The second means giving up control of your funds.

Otolith removes that trade-off. It automates rebalancing while your assets stay entirely in your own custody, and it adds a fiat on-ramp so a new user can start from local currency instead of needing crypto first. The target user is anyone who wants a hands-off, rules-based portfolio without surrendering their keys.

## How it works for a user

1. Create an account with a passkey. No seed phrase, no browser extension.
2. Set your target allocation, drift band, slippage limit, and cooldown. Signing this once installs the policy on your account.
3. Fund it, including directly with Turkish lira through the built-in anchor flow.
4. When the portfolio drifts past the band, a rebalance brings it back. Anyone can trigger it, but it can only execute within the rules you signed.
5. Revoke anytime. One signature removes the automation's permission and your balances stay put.

## Architecture

Otolith is built around a passkey-owned Soroban smart account and two Rust contracts that govern it.

**Smart account.** Each user's funds live in their own smart account, owned by a WebAuthn passkey. This is what makes the system non-custodial: the account holds the assets, and only its owner can authorize changes to how it is governed.

**Policy contract (`rebalance-policy`).** When a user sets a target, this contract stores the policy as a scoped rule on the account: target weights, drift band, slippage tolerance, cooldown, and an over-trading gate. On every rebalance it validates the proposed trade on-chain against those bounds and against the oracle price. If the trade violates any limit, it is rejected. This contract is the core of the security model.

**Rebalancer contract (`rebalancer`).** This executes an approved rebalance. It reads the current allocation, computes the trade needed to move toward target, and routes the swap. It can never move assets outside what the policy contract allows.

**Web app (`apps/web`).** A Next.js frontend for account creation, portfolio setup, live drift and value readouts, triggering rebalances, the lira on-ramp, and revoke. It reads chain state through public Stellar RPC and the oracle, with no trusted backend in the custody path.

## Stellar integrations

- **Soroban smart accounts** for non-custodial, passkey-owned wallets and the scoped policy signer that authorizes permissionless rebalances.
- **Reflector oracle** for on-chain pricing. Every rebalance is valued and bounds-checked against Reflector, so trades cannot execute at a price the contract would not trust.
- **Soroswap** as the execution venue. Approved rebalances route their swaps through Soroswap pools.
- **SEP-6 anchor** for the fiat on-ramp. The lira deposit runs a real SEP-6 flow against a Stellar testnet anchor, delivering USDC on-chain into the user's account.

## Key design decisions and trade-offs

**One signature, then none.** Setup is the only action a user signs. The policy rule it installs authorizes any future rebalance that stays within its bounds, so rebalances are permissionless and require no further signing. The trade-off is that the rule must be written carefully, since it is a standing authorization. We bound it tightly (target, band, slippage, cooldown, over-trading gate) and made it revocable in a single signature.

**Enforce on-chain, do not trust off-chain.** Rather than a backend deciding when and how to rebalance, the policy contract enforces every limit on-chain. The keeper that submits a rebalance only pays the fee; it is never a signer and cannot move funds. This keeps the trust surface on the contracts.

**Two assets first.** The current policy governs a two-asset target (XLM and USDC). The data model is built to extend to multi-asset baskets, which is the natural next step, but we kept v1 focused so the safety logic could be simple and auditable.

## Technical challenges

**Authorization safety.** The hardest part was making a standing, no-signer authorization safe. During our own security review we found and fixed a critical authorization flaw before deployment, where a rebalance could be steered outside the user's intended bounds. The fix shaped the current design, an independent destination check plus oracle-bounded trade sizing enforced in the policy contract.

**Getting a smart account to trade permissionlessly.** A permissionless rebalance is not a passkey operation, but the outer transaction still needs a classic account to pay the fee. We resolved this with a fee-only submitter that satisfies the transaction envelope without ever becoming a signer on the smart account, preserving the non-custodial property.

**Fiat into a smart account.** Anchors deliver to classic accounts, not directly to Soroban smart accounts. The on-ramp bridges that gap so a lira deposit lands as spendable USDC in the user's smart account.

## Deployed contracts (Stellar Testnet)

- `rebalance-policy`: `CADFMK3SCILEPHADKHRLH6W7HWNY6R3VSTYMWJINIPKDQX5NW2YJKS2Q`
- `rebalancer`: `CAPGATGURDTJDSUPPD6KC4NKLRG4FY4NOKHFCG7LHZ4FOP3FLKCLNGFV`

## Status

Working MVP on Stellar testnet. Account creation, setup, live drift and value, permissionless rebalancing, revoke, an on-chain activity feed, and the lira on-ramp are all functional and confirmed with real transactions, including both the successful rebalance path and the safety-rejection path (a rebalance is intentionally refused when a testnet pool cannot fill it within the user's slippage bound).

The anchor is a testnet sandbox, so its bank transfer and identity steps are simulated. The Stellar side, the SEP flow and the USDC delivery, is genuine on-chain testnet activity.

## Repo layout

- `contracts/`: Soroban smart contracts (Rust workspace)
- `packages/`: generated TypeScript bindings
- `apps/web`: frontend

## Development

Requires the Rust toolchain, the `wasm32-unknown-unknown` target, and the Stellar CLI.
