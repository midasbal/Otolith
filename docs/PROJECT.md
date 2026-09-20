# Otolith: what we are building and why

## The problem

Keeping a crypto portfolio at a target split (say, 60% XLM and 40% USDC) takes ongoing manual work: watch prices, notice drift, manually swap assets back to target. Most people don't do it consistently, and the tools that do it for them (robo-advisors, exchange auto-invest features) require handing custody of your funds to a third party.

## What Otolith does

Otolith lets a user set a target split between two assets, in their own self-custodied wallet, and have the portfolio rebalance itself automatically when it drifts too far from target, without ever giving up control of the funds. The rebalancing logic, the rules, and the execution all live on-chain on Stellar/Soroban. There is no company, server, or bot that the user has to trust to keep running or to behave honestly. Support for portfolios spanning more than two assets is planned for a later phase.

## Why on-chain matters here

A rebalancer that depends on an off-chain server has two problems: the server can go down (portfolio silently stops rebalancing) and the server operator could, in principle, misuse access. By keeping the whole thing on-chain, both problems go away. The worst a broken or malicious trigger can do is fail to submit a transaction (nothing happens, no loss) or submit one, in which case the on-chain policy contract itself, not the trigger, decides whether that transaction is allowed to execute. Funds are never withdrawable by anyone but the user, no matter who or what triggers a rebalance.

## Who this is for

Individuals who want a "set it and forget it" self-custody portfolio without trusting a custodian or a centralized bot. It is not a trading product, not a yield farm, and not a prediction or gambling product: it exists purely to keep a portfolio close to a target allocation.

## Funding the portfolio

A portfolio needs money in it before there's anything to rebalance. Otolith includes a "fund your portfolio in lira" flow: a real SEP-6 deposit against a Stellar testnet anchor, so a user can go from fiat straight to a funded, self-custody portfolio without ever touching a script or a block explorer. SEP-10 authentication and the SEP-6 deposit itself are genuine protocol calls against a real anchor, and the resulting USDC is delivered on-chain, for real. Two parts of the flow are honestly simulated rather than real, because this runs against a sandbox anchor: the bank transfer (no real bank sits behind a testnet anchor) and identity verification (auto-approved, no real check). The flow labels both of these plainly wherever they appear, rather than presenting them as more real than they are.

## What "done" looks like for the core product

- A user can fund their self-custody portfolio directly from fiat, without needing to already hold crypto.
- A user can define a target split between two whitelisted assets.
- A user can install a rebalance policy on their smart account, once.
- When drift exceeds a band, someone (the user, a permissionless caller, or an optional keeper) can trigger a rebalance.
- The rebalance is priced by an on-chain oracle, executed through an existing Stellar DEX, and validated by the user's own policy contract before it's allowed to touch their funds.
- Small, low-value corrections are skipped automatically because they'd cost more than they're worth.
