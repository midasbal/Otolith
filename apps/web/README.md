# apps/web

Frontend for Otolith: create or connect a passkey smart account, fund it from fiat, set target weights, install a rebalance policy, view balances and drift, and trigger a rebalance.

Next.js (App Router), TypeScript, Tailwind CSS. No component library: the design system is bespoke, a Soft UI (neumorphism) defined as design tokens in `app/styles/tokens.css` and built into a small set of primitives in `components/ui/`.

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

## Design system

Soft UI. One matte surface, not several: the page, every card, and every control share the same color, and depth comes only from a pair of soft shadows lit from the top left. Raised elements cast the pair outward; pressed elements, and every input, cast it inward. There are no borders, textures, or gradients.

### Where it lives

| Path | What it holds |
| --- | --- |
| `app/styles/tokens.css` | Every color, shadow, radius, size, and timing value. The only file to edit to retune the interface. |
| `app/styles/base.css` | The page itself: surface, ink, the focus ring, reduced motion. |
| `app/styles/components.css` | Every primitive's styles (`nm-*` classes), built only from the tokens. |
| `app/styles/glow.css`, `landing.css` | The headline glow and the hero dial. |
| `components/ui/` | The primitives as React components: Button, Card, Field, Input, Select, Slider, Toggle, Tabs, Stepper, Dialog, Toast, Notice, DataList, the allocation donut and drift gauge. |
| `components/app/` | The app's screens as presentational views. They take props and render; they call no hooks and reach no chain code. |
| `app/app/**/page.tsx`, `components/*.tsx` | The containers: the hooks, state, and handlers, unchanged in behavior, handing their results to the views. |

Tailwind is used for layout only. Its default palette and shadow scale are cleared in `tokens.css`, so a utility can reach a token and nothing else.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#e0e5ec` | The one surface color. |
| `--text` | `#1f2633` | Primary ink, 12.0:1 on `--bg`. |
| `--text-muted` | `#4a5568` | Secondary ink, 5.9:1. Nothing is set lighter than this. |
| `--accent` | `#4a3fd0` | The single saturated color: the primary action, focus, and active markers. 5.7:1 as text; white on it is 7.2:1. |
| `--accent-strong` | `#3a30ae` | The accent's hover and pressed step. |
| `--danger` | `#a23b3b` | Errors and destructive actions only, always with an icon and text. An ink, never a fill. 5.1:1. |
| `--shadow-light`, `--shadow-dark` | `rgba(255,255,255,.85)`, `rgba(163,177,198,.6)` | The two shadow colors every surface is built from. |
| `--depth` | `1` (`0.75` up to 40rem, `0.6` up to 24rem) | One multiplier on every shadow distance, so the interface sits lower on small screens. |
| `--raised-sm/md/lg`, `--pressed-sm/md/lg`, `--flat` | four aligned shadow layers each | The depth levels. Because the layers line up, a control eases from raised to pressed. |
| `--radius-sm/md/lg/xl/pill` | `0.75 / 1 / 1.5 / 2rem / 999px` | Wells and chips, inputs, cards, large panels, buttons and badges. |
| `--text-xs` to `--text-display`, `--text-instrument` | modular scale, ratio 1.25, fluid from `xl` up | Type. Zalando Sans Expanded for headings, Zalando Sans for body, JetBrains Mono with tabular figures for numerals, addresses, and hashes. |
| `--space-1` to `--space-24`, `--space-gutter/section/card` | 4px-based scale, fluid layout aliases | Spacing. |
| `--duration-fast/base/settle`, `--ease-settle`, `--ease-fade` | `150 / 250 / 1100ms` | Motion. One curve; everything that moves settles on it. |
| `--focus-width/offset/color` | `3px / 3px / accent` | The focus ring, shared by every interactive element. |
| `--glow-opacity/blur/hold` (and `-in`, `-out`, `-reach`, `-static-opacity`) | `0.4 / 0.2em / 1500ms` | The headline glow: intensity, spread, and how long a letter stays lit. |

### Retuning

- Base hue: change `--bg`, then set `--shadow-dark` to a darker shade of the same hue (about 60% opacity) and leave `--shadow-light` white. Keep the surface near its current lightness: much darker and the light shadow stops reading, much lighter and the dark one does.
- Accent: change `--accent` and `--accent-strong` together. It must stay at or above 4.5:1 against `--bg`, and `--on-accent` at or above 4.5:1 against it.
- After either, open the Tokens tab of the gallery (below): it reads the live values back from the page and shows each color's measured contrast.
- Depth and softness: `--depth` scales every shadow at once; the `--elev-*` distances set the three levels.

### Accessibility

Shadows are too faint to carry meaning (1.2:1 and 1.4:1 against the surface), so no state is ever shown by shadow alone. Current and selected items take the accent and a marker; errors take the danger ink, an icon, and text; disabled is opacity and a not-allowed cursor; a busy button keeps full contrast and shows a spinner. Every interactive element draws the same accent focus ring on keyboard focus. Under `prefers-reduced-motion` state changes are instant; under `prefers-contrast: more` every surface gains a real edge; under `forced-colors` the borders this design never draws come back in system colors.

### Gallery

`/dev/ui` shows every token, every primitive, and every app screen in every state (loading, empty, error, success) from mock data, with no wallet and no network. It exists in development only: the route is a 404 in a production build and is marked `noindex`.
