# apps/web

Frontend for Otolith: create or connect a passkey smart account, fund it from fiat, set target weights, install a rebalance policy, view balances and drift, and trigger a rebalance.

Next.js (App Router), TypeScript, Tailwind CSS. No component library: the design system is bespoke and lives entirely in `app/globals.css` as design tokens.

## Status

Functional against Stellar testnet. Wallet creation and connection are real (passkey-backed smart accounts via `smart-account-kit`), balances are read live from chain, the policy setup flow installs a real on-chain rule, and rebalancing can be triggered and is validated by the deployed contracts. A "fund your portfolio in lira" flow (`/api/deposit-try`, see `lib/server/anchor.ts`) drives a real SEP-6 deposit against a Stellar testnet anchor and delivers testnet USDC into the user's account on-chain.

## Run it

```bash
cd apps/web
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values there. `.env.local` is gitignored and never committed; `.env.example` documents the variable names only, with no real secrets.

`DEPLOYER_SECRET_KEY` is server-only: it has no `NEXT_PUBLIC_` prefix, so Next.js never inlines it into the client bundle, and it is only ever read from `lib/server/deployer.ts` (guarded by the `server-only` import) and the API routes under `app/api/` that use it. The real secret exists only in your own `.env.local`.

## Design tokens

Defined once, in `app/globals.css`, as CSS custom properties plus a Tailwind `@theme` block. Every component in the page reads from these, never from a raw color, size, or timing value.

- Color: two surfaces, not one. A pale lilac page carries deep ink text and quiet hairlines; dark metal panels (`.panel`, built from `--color-surface-raised` plus the layered `--panel-field` grain, sheen, and sweep) float on that page carrying pale mist text. Cream is the single chromatic note in the whole system: reserved for the instrument's key figures and for filled elements (a badge, a button), never used as text directly on the light page, where it has nowhere near enough contrast. The page background itself is not a single flat fill either: `--surface-field` layers two very soft, large radial fields (near-neighbor shades of the base) behind the flat color, for a quiet sense of depth without reading as a visible gradient.
- Type: Zalando Sans Expanded for headings and the wordmark (the same letterforms as the body face, only wider, for a confident and architectural feel), Zalando Sans (normal width) for body copy, JetBrains Mono for numerals, addresses, and hashes, set with tabular figures. An eight-step modular scale (base 16px, ratio 1.25), plus a distinct `instrument` step reserved for large measured figures.
- Space: Tailwind's default spacing scale, used generously and consistently rather than filled edge to edge.
- Motion: one signature easing curve (`--ease-settle`) and three durations (`--duration-fast`, `--duration-base`, `--duration-settle`). Motion always shows a value or state resolving, never plays for decoration, and is disabled under `prefers-reduced-motion`.
