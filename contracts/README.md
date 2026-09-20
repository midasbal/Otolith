# contracts

Soroban smart contracts. One folder per contract, each its own crate, added as a member of the root workspace `Cargo.toml`.

- `rebalance-policy`: a `stellar-accounts` `Policy` implementation. Attached to a zero-signer context rule on a user's smart account (deployed via `stellar/smart-account-kit`), it is the sole gate for a permissionless rebalance: asset whitelist, sell/buy direction, and slippage bound. Full detail in its own README.
- `rebalancer`: reads a live Reflector oracle price for both assets, refuses if either is missing or stale, computes the exact swap, and calls Soroswap's router. This is the compute half of compute-then-validate; `rebalance-policy` is the validate half.

Feasibility spike (throwaway, hand-rolled custom account, superseded by these real contracts): [spikes/custody-model/](../spikes/custody-model/).
