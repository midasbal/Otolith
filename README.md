# Otolith

A non-custodial, on-chain portfolio rebalancer on Stellar.

Otolith keeps a two-asset XLM and USDC portfolio near a target split. You choose the split and sign once with a passkey. After that, a rebalance can be triggered by anyone, and it can only execute inside the limits you signed. Your funds stay in your own smart account the whole time, and one signature removes the permission again. It runs on Stellar testnet only.

**Live app:** https://otolith.xyz/ · **Docs:** https://otolith.xyz/docs · **SCF submission:** _link to be added_

## How it works

Each user's funds sit in a passkey-owned Soroban smart account. Setting a target installs a rule on that account with no signers and one policy attached, the `rebalance-policy` contract. The rule defers every authorization to the policy, which is what lets a rebalance happen without a signature, and the policy approves only one narrow shape: a swap of XLM for USDC through Soroswap, delivered back to the account, inside the bounds you set.

The design is compute-then-validate. The `rebalancer` contract reads both prices from the Reflector oracle, sizes the exact trade, and calls the router. The policy does not trust that arithmetic: it reads the oracle itself, derives its own slippage floor and trade ceiling, enforces the cooldown, and checks the finished swap against them. A missing or stale price stops the rebalance, and nothing falls back to another source. The keeper that submits a rebalance only pays the fee. It is never a signer on any account, and the contracts never authorize it to move funds.

The architecture, parameters and error codes are in the [technical guide](https://otolith.xyz/docs). The plain-language version is the user guide on the same page.

## Repository layout

```
contracts/            Rust workspace of Soroban contracts
  rebalance-policy/     the policy that gates every rebalance (a stellar-accounts Policy)
  rebalancer/           prices, sizes and submits the swap
  rebalance-sizing/     pure shared crate: the sizing formula, no contract surface
apps/web/             Next.js app (App Router, TypeScript, Tailwind)
docs/                 GLOSSARY.md, PROJECT.md, and DESIGN.md (the design-system reference)
```

The web app uses no component library and no animation or 3D library.

## Running locally

**Prerequisites**

- Contracts: Rust (edition 2021) with the `wasm32-unknown-unknown` target, and the Stellar CLI. `soroban-sdk` 26.1.1 and `stellar-accounts` 0.7.2 are pinned in the workspace `Cargo.toml`.
- Web app: Node 20.9 or newer (Next.js 16).

**Contracts**, from the repo root:

```bash
cargo test                # run the contract tests
stellar contract build    # build the wasm
```

The repo has no Makefile or build script, so these are the plain commands. Deploying is done with the Stellar CLI, and the repo carries no deploy script.

**Web app**, from `apps/web`:

```bash
npm install
npm run dev               # http://localhost:3000
npm run build
npm start
npm run lint
npm test
npx tsc --noEmit
```

**Environment variables.** Copy `apps/web/.env.example` to `apps/web/.env.local` and fill it in there. `.env.local` is never committed. The app reads:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_HORIZON_URL` | Horizon endpoint. Defaults to the public testnet. |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Soroban RPC endpoint. Defaults to the public testnet. |
| `DEPLOYER_SECRET_KEY` | Server-only key that sponsors fees and submits rebalances. |
| `DEPLOYER_ENFORCE` | Enforces the deploy sponsor's allowlist, rejecting requests that fail it. The deployed instance runs with this enabled. Unset, failures are only logged. |
| `DEPLOYER_MIN_BALANCE_XLM` | Balance floor for the fee key. Below it, sponsoring stops. Defaults to 100. |
| `UPSTASH_REDIS_REST_URL` | Rate-limit store, optional. With it missing, requests are allowed. |
| `UPSTASH_REDIS_REST_TOKEN` | Credential for the rate-limit store, optional. |

`DEPLOYER_SECRET_KEY` is server-only: it has no `NEXT_PUBLIC_` prefix, it is read only behind the `server-only` import, and it lives in `.env.local` and nowhere in the repository. Without it the app still reads chain state, but account creation and keeper rebalances need it.

## Deployed contracts (Stellar testnet)

- `rebalance-policy`: `CADFMK3SCILEPHADKHRLH6W7HWNY6R3VSTYMWJINIPKDQX5NW2YJKS2Q`
- `rebalancer`: `CAPGATGURDTJDSUPPD6KC4NKLRG4FY4NOKHFCG7LHZ4FOP3FLKCLNGFV`

The source of truth is `apps/web/lib/stellar/policy-config.ts`. The full list, with the router, oracle, tokens and verifier, is under [Deployed contracts](https://otolith.xyz/docs#tech-contracts) in the docs.

## Status and roadmap

Working on Stellar testnet. Account creation with a passkey, policy setup, live drift and value, permissionless rebalancing, revoke, and an on-chain activity feed all work, and have been confirmed with real transactions, including both a successful rebalance and a rebalance the contracts correctly refused.

The roadmap from here:

**Non-custodial completeness**

- A withdraw and send flow, so funds can leave the account from the interface. The account already permits it; this adds the interface and the fee-sponsor path.
- Account recovery: a user-held backup signer set up at onboarding, so a lost passkey does not mean a lost account, and a sign-in path that does not depend on a passkey.
- Optional automated rebalancing: a scheduled, permissionless trigger, with the manual button and open contract calls as fallbacks.
- Continuous integration and a frontend test suite.

**Protocol v2 (a new contract deployment)**

- Bidirectional rebalancing, to correct an overweight position as well as an underweight one.
- Multi-asset baskets beyond the current two-asset pair.
- On-chain rebalance events, storage lifetime handling, cross-field parameter validation, and a caller-tip seam that opens the trigger to a competitive keeper market.

**Security and mainnet**

- A public adversarial testing program against a frozen release candidate.
- A security review, then mainnet deployment with split operational keys, multisig, monitoring, and a documented incident process.

## Security

The contracts enforce the limits on-chain, and the web app and keeper cannot authorize a trade. They are testnet deployments. They went through an internal review, in which a critical authorization flaw was found and fixed before deployment, and they have not been externally audited. The threat model and what enforces each protection are in the [security model](https://otolith.xyz/docs#tech-security).

## License

MIT. See [LICENSE](LICENSE).
