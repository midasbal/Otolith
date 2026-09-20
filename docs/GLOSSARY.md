# Otolith: glossary

Plain-language definitions, not formal ones. If a term is used differently elsewhere in Stellar/Soroban docs, this file describes how we use it in Otolith specifically.

- **Rebalance**: a trade (or set of trades) that brings a portfolio's actual asset weights back toward the user's chosen target weights.
- **Drift**: how far a portfolio's current weights have moved away from target weights, usually expressed as a percentage.
- **Target weights**: the split between the two assets the user wants their portfolio to hold, e.g. 60% XLM and 40% USDC. The current version rebalances between two assets; support for multi-asset baskets is planned for a later phase.
- **Band**: the amount of drift that's allowed before a rebalance becomes eligible to trigger. A tight band rebalances more often and more precisely; a wide band rebalances less often and tolerates more drift.
- **Cooldown**: a minimum amount of time that must pass between rebalances for the same account, to prevent rapid repeated trading.
- **Oracle**: an on-chain source of price data (Otolith uses Reflector) that the contracts read to know current asset prices when deciding whether and how to rebalance.
- **Smart account**: a Soroban contract that acts as a user's wallet, deciding what counts as valid authorization for actions taken on the user's behalf, instead of relying on a single fixed private key.
- **Policy signer**: a scoped signer installed on a smart account that can only authorize a narrow, pre-defined category of actions (in Otolith's case, valid rebalances), and nothing else.
- **Permissionless trigger**: the ability for anyone, not just the account owner, to call the function that executes a rebalance, when the account is eligible. This is what lets rebalancing happen without a company running a server.
- **Slippage**: the difference between the price you expected to get on a swap and the price you actually got, usually because the trade itself moves the market price as it executes.
- **Anchor**: a regulated or sandboxed service that bridges Stellar to traditional money, letting a user deposit fiat currency and receive an on-chain asset in return (or the reverse). Otolith's lira-funding flow uses a Stellar testnet anchor.
- **SEP-6**: the Stellar standard for a programmatic (non-interactive) deposit or withdrawal against an anchor. Otolith's server drives this flow directly; the user never leaves the app.
- **Deposit relay**: a server-held classic Stellar account that stands in for the user's smart account during the deposit flow, since a smart account has no classic key of its own to authenticate with an anchor. It receives the anchor's asset and forwards the equivalent value into the user's smart account; it never becomes a signer on the user's account and holds none of the user's funds afterward.
