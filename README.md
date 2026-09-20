# Otolith

A fully on-chain, self-custody personal portfolio auto-rebalancer on Stellar/Soroban. A user sets target weights for a few assets in their own wallet. When the portfolio drifts too far from those targets, a rebalance swaps only whitelisted assets through existing Stellar DEXs to bring it back, priced by an on-chain oracle. Funds stay in the user's control and are never withdrawable by anyone but the user.

## Status

Non-custodial rebalancing is implemented and validated on Stellar testnet: a smart account with a scoped policy signer, an oracle-priced rebalancer, and both the permissionless-trigger and rejection paths confirmed with real transactions. A "fund your portfolio in lira" flow lets a user go from fiat straight to a funded portfolio through a real SEP-6 deposit against a Stellar testnet anchor.

## Docs

- [docs/PROJECT.md](docs/PROJECT.md): what we're building and why.
- [docs/GLOSSARY.md](docs/GLOSSARY.md): plain-language term definitions.
- Contract-level design lives alongside each contract: see `contracts/rebalance-policy/README.md` and `contracts/rebalancer/README.md`.

## Repo layout

- `contracts/`: Soroban smart contracts (Rust workspace).
- `packages/`: generated TypeScript bindings.
- `apps/web`: frontend.
- `apps/indexer`: backend/indexer.

## Development

Requires the Rust toolchain, the `wasm32-unknown-unknown` target, and the Stellar CLI.
