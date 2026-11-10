# Threat model

This document describes what the Otolith contracts protect, who and what they trust, which properties they enforce, and what they do not. It is written for security reviewers and auditors. Every claim is tied to the code: the contracts in `contracts/`, their tests, and the server routes in `apps/web/app/api` and `apps/web/lib/server`. Where the code does not support a statement, it is not made here.

Contract error numbers are the `#[contracterror]` values in each crate. The policy's run from 1 to 26 (`contracts/rebalance-policy/src/lib.rs`), and the rebalancer's from 1 to 9 (`contracts/rebalancer/src/lib.rs`). The two ranges overlap, so an error number is only meaningful with the contract that raised it.

## 1. Scope and assets

**What is protected.** The XLM and USDC held in a user's own smart account. The system is non-custodial: no contract, server or key of ours holds a user balance, and nothing in this design moves funds anywhere but back into the same account.

**Trust boundary.** The two contracts are the boundary:

- `rebalance-policy`, a `stellar-accounts` `Policy` attached to a context rule with no signers. The account defers authorization for that rule to the policy's `enforce`, so the policy is the only gate on a permissionless rebalance.
- `rebalancer`, the public entry point that prices, sizes and submits the swap. It is untrusted for authorization: the policy re-derives what it needs and checks the finished swap.
- `rebalance-sizing`, a pure crate with no contract surface, holding the one formula both contracts use for the ideal trade size. It performs no I/O, no cross-contract call and no authorization, because it also runs inside `enforce`.

**In scope.** The policy, the rebalancer, the sizing crate, and the server routes that sponsor fees and submit rebalances (`/api/deployer`, `/api/rebalance`).

**Out of scope, assumed correct.** The OpenZeppelin smart account contract and its authorization machinery, the WebAuthn verifier, Soroswap, the Reflector oracle, Stellar consensus and the Soroban host, the browser's WebAuthn implementation, and the web interface's presentation. Where the design depends on one of these, section 6 names the assumption.

## 2. Actors and trust assumptions

| Actor | What it is | Trusted for | Not trusted for |
| --- | --- | --- | --- |
| Owner and passkey | The holder of the account's passkey, signing under rule 0. | Installing and revoking the policy, choosing its parameters, and all account management. | Nothing is asked of the owner at rebalance time. |
| Permissionless caller | Anyone who invokes `rebalancer.rebalance`, including the user. | Nothing. | The trade size, the assets, the recipient, the router, the oracle. The caller names an account and a rule, never an amount. |
| Keeper | Our server, submitting a rebalance with the deployer key as the fee source. | Paying the fee. | Authorizing anything. It signs no authorization entry for the account, is never a signer, and the contracts never authorize it to transfer funds. |
| Reflector oracle | The price source, read by ticker symbol. | The value of a price, within a bounded age. | Correctness of a price, or availability. A missing or stale price stops the rebalance. |
| Soroswap | The router and pool that execute the swap. | Executing a swap at no worse than the slippage floor. | Anything beyond the floor: the quote, the route, the pair address (the policy derives it). |
| Deployer and server | The fee sponsor and keeper submitter. | Fee payment and request screening. | Custody. It holds no user funds and cannot sign for an account. |

## 3. Security properties the contracts enforce

These are the invariants. "Raises" is the error returned when the property would be violated. The last column names the test in the same crate that exercises it, or says none exists.

### Policy (`enforce`, `install`, `uninstall`)

The policy's public authorization method is `enforce`, the `Policy` trait method the account calls once per authorization context. It delegates the context checks to an internal helper, `verify_context`. The properties below are stated for `enforce`, and the checks themselves live in `verify_context`.

| Property | Mechanism | Raises | Test |
| --- | --- | --- | --- |
| Only two contexts can be approved: a router swap and a sell-asset transfer. | `enforce` matches `c.contract == params.router` with `swap_exact_tokens_for_tokens`, or `c.contract == params.sell_asset` with `transfer`. Contract-creation contexts and every other call are refused. | `InvalidContext` (3), `UnrecognizedContext` (10) | none dedicated |
| The policy can never be used to manage the account. | A context whose contract is the smart account itself is refused first, whatever the function. | `SelfManagementNotAllowed` (4) | `enforce_rejects_self_management` |
| The swap output goes to the account. | The fourth swap argument must equal the smart account. | `WrongRecipient` (5) | none dedicated |
| The swap path is exactly the whitelisted pair, in direction. | Path length must be 2, with elements `[sell_asset, buy_asset]`. | `InvalidPath` (6), `AssetNotWhitelisted` (7) | `enforce_rejects_non_whitelisted_asset` |
| Rebalances are spaced by the cooldown. | The time since `LastRebalance` for the rule must be at least `cooldown_secs`. Checked before any oracle read. `LastRebalance` is written once, only after every other swap check passes. | `CooldownActive` (22) | `enforce_rejects_within_cooldown`, `enforce_allows_after_cooldown_elapses` |
| Prices are present, current and valid. | Both oracle prices must exist, not be dated after the ledger time, be no older than 600 seconds, and be positive. | `PriceMissing` (14), `PriceStale` (15), `PriceInvalid` (26) | `enforce_rejects_missing_price`, `_stale_price`, `_future_price`, `_zero_price` |
| The trade cannot exceed the size that closes the drift. | `amount_in` must be at most `rebalance_sizing::ideal_amount_in`, computed by the policy from live balances and prices. At or past target the ceiling is 0. | `TradeTooLarge` (23) | `enforce_rejects_oversized_direct_router_swap` |
| The swap output meets an independently derived floor. | `amount_out_min` must be at least the oracle-implied output reduced by `slippage_tolerance_bps`, rounded up. | `SlippageTooHigh` (8) | `enforce_rejects_slippage_breach`, `_trade_just_outside_tolerance`, `_amount_out_min_at_old_floor_rounding` |
| The token transfer is bound to an approved swap. | The swap branch writes a single-use marker holding the approved `amount_in`. The transfer branch requires the sender to be the account, the destination to be the stored pair, and a marker with exactly that amount, which it removes. | `WrongSender` (9), `WrongDestination` (24), `NoMatchingApproval` (25) | `enforce_rejects_standalone_transfer_with_no_matching_swap` covers the marker. None dedicated for sender or destination. |
| Parameters are range checked at install. | Each setting is bounded (slippage 30 to 500 bps, band 10 to 2,000, target 0 to 10,000, minimum trade size 0 to 10^15, tip 0 to 1,000, cost ratio 500 to 5,000, cooldown 300 to 604,800 seconds). | `InvalidSlippageTolerance` (13), `InvalidBandThreshold` (17), `InvalidTargetWeight` (16), `InvalidMinTradeSize` (18), `InvalidReservedTip` (19), `InvalidMaxCostRatio` (20), `InvalidCooldown` (21) | One test per bound |
| A rule has one policy installation, and the pair is not caller supplied. | `install` refuses a second install for the same `(account, rule)` and overwrites `pair` with the address from a live `router_pair_for` call. | `AlreadyInstalled` (2) | `install_twice_fails`, `install_then_get_params` |

### Rebalancer (`rebalance`)

| Property | Mechanism | Raises | Test |
| --- | --- | --- | --- |
| No trade on a bad price. | Both prices are read first, before the policy, with the same missing, stale (including future-dated) and non-positive checks. | `PriceMissing` (1), `PriceStale` (2), `PriceInvalid` (9) | `refuses_missing_price`, `_stale_price`, `_future_price`, `_zero_price` |
| No trade inside the band. | Drift is the target buy weight minus the current one. It must exceed `band_threshold_bps`. At or past target the sizing is not actionable, reported as the same error. | `BelowBand` (5) | `drift_just_inside_band_does_nothing` |
| Dust trades are skipped. | The sized trade must meet `min_trade_size`. | `BelowMinTradeSize` (6) | `trade_below_min_size_skipped` |
| A cost ceiling. | Estimated cost (30 bps pool fee, plus slippage tolerance, plus tip allowance) must not exceed `max_cost_ratio_bps`. | `CostExceedsBenefit` (7) | `cost_exceeds_benefit_skipped` |
| The trade does not overshoot the target. | Sized against the pool's own quote, scaled down when the pool returns more value than the oracle implies. After the swap the real result is recomputed, and the whole transaction reverts if the buy weight lands more than 50 bps past target. | `OvershootTolerance` (8) | `premium_pool_sizing_avoids_overshoot`, `enforce_overshoot_tolerance_on_swap_result` |
| The minimum output is never looser than stated. | `amount_out_min` is rounded up. | none (arithmetic) | `amount_out_min_rounds_up_not_down` |

The rebalancer's size is always at or below the policy's ceiling, because both start from `ideal_amount_in` and the rebalancer's pool correction only ever shrinks the trade. A legitimate rebalance therefore cannot be refused by the ceiling.

## 4. Threats and mitigations

| Threat | Defense | Enforced in |
| --- | --- | --- |
| **A caller chooses the trade size.** | `rebalance` has no amount argument. The size is computed from balances, target and a pool quote. The policy independently caps `amount_in` at the ideal size from live data. | Rebalancer, policy |
| **Tokens go somewhere other than the account (the pool skim path).** | The swap recipient must be the account. The transfer must go to the stored pair, which `install` derived, never one the caller supplies. A transfer is approved only if it consumes a marker the swap branch wrote for the same amount. The code's comment records that a Soroswap pair exposes a permissionless skim of any balance above its reserves, so a correctly addressed transfer with no accompanying swap would still leak. | Policy |
| **A direct router call bypasses the rebalancer.** | The policy does not rely on the rebalancer. It checks router, path, recipient, cooldown, prices, size ceiling and slippage floor on the swap itself. | Policy |
| **A stale, missing, future-dated or non-positive price.** | Refused in both contracts, with no fallback price. A future-dated timestamp is an error, not age zero. | Rebalancer, policy |
| **A manipulated price.** | Not prevented. Both contracts read the same oracle, so a wrong value is wrong in both. The age bound and the pool quote correction limit exposure, and the slippage floor bounds what a poor fill can cost. See section 6. | Residual |
| **Over-trading.** | Drift band, minimum trade size, cooldown enforced by the policy independently of the rebalancer, and the post-swap overshoot revert. | Rebalancer, policy |
| **The policy is used to change the account.** | Any context aimed at the account is refused first. The rule has no signers, so it can authorize nothing except what `enforce` approves. | Policy |
| **Reentrancy during the swap.** | `enforce` calls `require_auth` only on the account and makes only view calls (`lastprice`, `decimals`, `balance`). The transfer branch reads the stored `pair` instead of calling the router, since the router is mid-execution and the code notes Soroban refuses a reentrant call. | Policy |
| **A wrong router, asset or oracle at call time.** | The policy compares the swap's contract to `params.router`, and the path to the stored assets. The rebalancer takes router, oracle and assets as arguments but holds no authority over them. | Policy |
| **A wrong router, asset or oracle chosen at install.** | Not prevented on-chain: `install` range checks numeric settings but accepts any router, oracle and asset addresses. The owner signs them. See section 7. | Residual |
| **Out-of-range parameters.** | Every numeric setting is bounded at install. The form checks the same ranges first, but the contract is the authority. | Policy |
| **Draining the fee key.** | `/api/deployer` validates every request against an allowlist of four shapes (deploy, fund, install, revoke), requires address credentials and at least one auth entry, and refuses any entry signed by the deployer itself. A size cap (32 KiB deployer, 1 KiB rebalance), per-IP rate limits (10 per 10 minutes, 5 per minute, 30 per minute) and a balance floor sit in front. The balance floor refuses sponsoring once the key's balance reaches it, without revealing the balance. Allowlist enforcement is a deployment setting, and the deployed instance runs with it enabled. | Server |
| **A keeper submits a doomed or forged rebalance.** | `POST /api/rebalance` re-simulates, submits only a rebalance that is ready, and never signs for the account. Rejections come from the policy regardless of what the keeper sends. | Server, policy |

## 5. Findings identified and resolved during development

The code and its tests record the findings below. The code does not stamp severities, so the ratings below are the project's impact assessment: the impact had the gap reached a live deployment and been triggered. They are distinct from the code-grounded facts elsewhere in this document. Comments in the contracts label three findings (3, 4 and 5) as belonging to an earlier threat model, whose numbering is not otherwise present in the repository; findings 1 and 2 are not named in the code.

| Finding | Severity | What the code records | Fix | Verification |
| --- | --- | --- | --- | --- |
| **A bare transfer context could be approved.** | Critical. An unauthenticated path to draining the whole account. | The test comment records that a transfer context with no accompanying swap "used to pass because verify_context's transfer branch only ever checked who the funds moved from." The destination comment adds that a Soroswap pair's permissionless skim makes even a correctly addressed unaccompanied transfer a real, if bounded, leak. | The transfer branch now requires the destination to be the stored pair, and a single-use marker, written by the swap branch for that rule and amount, which it consumes. The marker binds the swap context and the transfer context. | `enforce_rejects_standalone_transfer_with_no_matching_swap` expects `NoMatchingApproval` (25). The destination and sender checks have no dedicated negative test. |
| **The swap size was unbounded on a direct router call.** | High. A forced oversized swap and value loss through sandwiching, no theft. | The test comment records that a direct router call with an `amount_in` far beyond what the gate would justify "used to pass every check the swap branch ran, since none of them bounded amount_in itself." | An independent ceiling, from `rebalance_sizing::ideal_amount_in` over live balances and prices, is checked before the slippage floor. | `enforce_rejects_oversized_direct_router_swap` expects `TradeTooLarge` (23). |
| **Finding 3: a future-dated oracle timestamp counted as fresh.** | Medium | The timestamp was folded into age with `unwrap_or(0)`, treating it as maximally fresh. | The subtraction is checked and a future-dated price is `PriceStale`. | `enforce_rejects_future_price` (15), `refuses_future_price` (2). |
| **Finding 4: a zero or negative price passed the freshness check.** | Medium | It collapsed the slippage floor to zero (or inverted every downstream computation). | A price that is not positive is refused. | `enforce_rejects_zero_price` (26), `refuses_zero_price` (9). |
| **Finding 5: the slippage floor rounded down.** | Low | A floor rounded down is slightly looser than the stated tolerance. | The floor and `amount_out_min` round up (ceiling division). | `enforce_rejects_amount_out_min_at_old_floor_rounding` (8), `amount_out_min_rounds_up_not_down`. |
| **Hygiene: `min_trade_size` had no upper bound.** | Low | A value near `i128::MAX` installed a rule that could never trade, silently disabling it. | An upper bound of 10^15 raw units, checked at install. | `install_rejects_min_trade_size_above_max` (18). |
| **A testnet finding: oracle-only sizing overshot the target.** | Low | Recorded in a regression test: when the pool is priced above the oracle, sizing against the oracle alone overshoots. | Sizing is corrected against the pool's own quote, and the real result is checked after the swap, reverting past 50 bps over target. The stated guarantee is bounded overshoot, not an exact landing. | `premium_pool_sizing_avoids_overshoot`, `enforce_overshoot_tolerance_on_swap_result` (8). |

## 6. Residual risks and named trust assumptions

- **The oracle is trusted for value.** The contracts bound a price's age and validity, not its correctness. Both contracts read the same feed, so an incorrect price is incorrect in both and the slippage floor derives from it. The only independent price signal is the pool's quote, used to shrink the trade.
- **The pool is trusted only to the slippage floor.** A poor fill is bounded by `slippage_tolerance_bps` (at most 500), not prevented.
- **No upgrade path.** Neither contract's source defines an admin, owner or upgrade function. A bug cannot be patched in place. The response is that users revoke, which removes the rule and, through the account, the stored parameters. What an already deployed instance allows depends on how it was deployed, which the source cannot show.
- **The passkey is bound to the app's domain.** The app sets no explicit relying-party id when it constructs the account kit (`getKit` in `components/wallet-provider.tsx`), so the browser's default, the page's own domain, applies under WebAuthn. A credential is not usable from another domain, which resists phishing and also means a domain change strands existing credentials. Recovery is not built.
- **Testnet only, not externally audited.** The contracts are deployed on Stellar testnet and have not been externally audited.
- **The marker's required conditions.** The single-use marker depends on three things the contracts do not themselves enforce. First, the account's `do_check_auth` must evaluate contexts in the order they appear in one authorization, so the swap is approved before its nested transfer. Second, the nested transfer must arise only as a sub-invocation of the swap's own execution. Third, the router must move the sell asset to the pair in a single transfer of exactly `amount_in`, since the transfer branch requires equality (a router that moved a different amount would fail closed, with `NoMatchingApproval`). The marker lives in temporary storage so that a stray, unconsumed marker cannot persist long. It has no expiry of its own beyond that storage lifetime, and the code's comment acknowledges a scenario "this design did not anticipate."

## 7. Known limitations and hardening backlog

Open items visible in the code, in rough order of weight:

1. **Router and oracle are not pinned at install.** `install` validates numeric ranges but accepts any router, oracle and asset addresses, and derives `pair` from the supplied router. The owner signs those values, but a malicious or compromised interface could present parameters the user cannot read. A deployment-level set of permitted routers and oracles, held by the policy, would close this.
2. **No cross-field parameter validation.** Each setting is checked alone, and some valid combinations disable a policy silently:
   - The cost gate compares the estimated rate (30 bps plus slippage plus tip) with `max_cost_ratio_bps`. The contract accepts a ratio as low as 500 and slippage up to 500, so a combination can make `CostExceedsBenefit` permanent.
   - Drift cannot exceed the target weight, so a band at or above the target weight never triggers, and a target of 0 is never actionable.
   - Nothing checks that `sell_asset` and `buy_asset` differ or that the ticker symbols match their assets.
3. **No storage lifetime handling.** Neither contract extends the lifetime of its storage. `Params` and `LastRebalance` are persistent entries, so an account left idle past their lifetime can find them archived, and the policy would then fail until they are restored.
4. **Error-code collision.** The policy's codes (1 to 26) and the rebalancer's (1 to 9) overlap. The keeper maps contract error numbers to states by hand and reads them as the rebalancer's (`lib/server/rebalance.ts`), which the code argues is safe because a call it builds cannot reach the colliding policy errors. A reviewer should treat that as a convention, not a guarantee.
5. **No rebalance events.** Neither contract emits an event on a rebalance. The activity feed discovers rebalances from token transfer events to the account, which is a heuristic and only fits the current single direction.
6. **The swap deadline is not checked by the policy.** `deadline` is the fifth swap argument. The policy decodes the first four and the rebalancer passes the caller's value to the router unchanged.
7. **Test coverage gaps.** No dedicated negative test exists for `InvalidContext`, `UnrecognizedContext`, `WrongRecipient`, `InvalidPath`, `WrongSender` or `WrongDestination`. The happy-path test exercises the checks as passing but does not show each one failing.
8. **Server hardening.** One key plays both the fee-sponsor and the keeper role, so a single compromise covers both. Rate limits are per client IP, taken from the first forwarded address, which is only as trustworthy as the proxy in front.
