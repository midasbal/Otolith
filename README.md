# Otolith

A non-custodial, on-chain portfolio auto-rebalancer on Stellar.

You choose a target allocation, for example 80% XLM and 20% USDC, and sign it once with a passkey. Otolith keeps your portfolio aligned to that target automatically. Your funds never leave your own account, and you can withdraw the automation's permission at any time.

## How it works

Setting a target installs a bounded policy rule on your own Soroban smart account. It records your target weights, a drift band, a slippage limit, and a cooldown. That one signature is the only one you ever give.

After that, rebalancing is permissionless. When your portfolio drifts past the band, anyone can trigger a rebalance, but it only succeeds if it obeys the rule you set. The policy contract checks every trade on-chain against your bounds, prices it against the Reflector oracle, and routes the swap through Soroswap. Nothing moves outside those limits, and no one but you can move your funds or change your policy.

Revoking is the mirror of setup: one signature removes the rule, and the automation can no longer act. Your balances stay exactly where they are.

## Fund with local currency

Otolith includes a fiat on-ramp built on a Stellar anchor. You can fund your portfolio with Turkish lira through a SEP-6 deposit, and the resulting USDC arrives directly in your self-custodied account, ready to rebalance.

## Status

Otolith is a working MVP, live on Stellar testnet. Account creation, portfolio setup, live drift and value readouts, permissionless rebalancing, revoke, an on-chain activity feed, and the lira on-ramp are all functional and confirmed with real transactions, including both the successful rebalance path and the safety-rejection path.

The anchor is a testnet sandbox, so its bank transfer and identity steps are simulated. Everything on the Stellar side, the SEP flow and the USDC delivery, is genuine on-chain testnet activity.

## Security

The rebalancer never has custody. It can only move assets within the exact bounds a user signed, and it is enforced on-chain rather than trusted off-chain. During our own security review we found and fixed a critical authorization flaw before deployment, which shaped the current design of the policy checks.

## Repo layout

- `contracts/`: Soroban smart contracts (Rust workspace)
- `packages/`: generated TypeScript bindings
- `apps/web`: frontend
- `apps/indexer`: backend and indexer

## Docs

- [docs/PROJECT.md](docs/PROJECT.md): what we are building and why
- [docs/GLOSSARY.md](docs/GLOSSARY.md): plain-language term definitions
- Contract design lives alongside each contract, in `contracts/rebalance-policy/README.md` and `contracts/rebalancer/README.md`

## Development

Requires the Rust toolchain, the `wasm32-unknown-unknown` target, and the Stellar CLI.
