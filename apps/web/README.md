# apps/web

Frontend for Otolith: create or connect a passkey smart account, fund it from fiat, set target weights, install a rebalance policy, view balances and drift, and trigger a rebalance.

Next.js (App Router), TypeScript, Tailwind CSS. No component library and no animation or 3D library: the design system is bespoke, a dark identity built around one animated background, defined as design tokens in `app/styles/tokens.css` and built into a small set of primitives in `components/ui/`.

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

Deep water. The page is one dark ground, and behind everything on it runs Annuli: a field of growth rings, the rings an otolith lays down, drawn in WebGL. Content sits over the field on quiet panels, a slightly lifted surface with a hairline edge; inputs are darker wells cut into a panel. One violet accent, taken from the rings, marks the primary action, focus, and whatever is current.

### Where it lives

| Path | What it holds |
| --- | --- |
| `app/styles/tokens.css` | Every color, shadow, radius, size, and timing value. The only file to edit to retune the interface. |
| `app/styles/base.css` | The page itself: ground, ink, the focus ring, reduced motion. |
| `app/styles/components.css` | Every primitive's styles (`ot-*` classes), built only from the tokens. |
| `app/styles/background.css` | The still picture under the field, the canvas, and the pause control's reserved space. |
| `app/styles/glow.css`, `landing.css` | The headline glow; the landing page's chapters, hero dial, level, and drift simulator. |
| `components/background/` | The background: `engine.ts` (the WebGL loop), `annuli.ts` (the scene), `background.tsx` (the provider, the pause control, and `useBackground`). |
| `components/ui/` | The primitives as React components: Button, Card, Field, Input, Select, Slider, Toggle, Tabs, Stepper, Dialog, Toast, Notice, DataList, Badge, the mark, the level, the allocation donut and drift gauge. The gauge's labels are placed by arithmetic in the stylesheet (they are monospaced, so their widths are known), which keeps them apart and inside the track for any reading. |
| `components/landing/` | The hero dial, the drift simulator, and the chapter marker. |
| `components/app/` | The app's screens as presentational views. They take props and render; they call no data hooks and reach no chain code. |
| `app/app/**/page.tsx`, `components/*.tsx` | The containers: the hooks, state, and handlers, unchanged in behavior, handing their results to the views. |
| `public/background/` | The exported still frames of the field (AVIF and WebP, three sizes). |

Tailwind is used for layout only. Its default palette and shadow scale are cleared in `tokens.css`, so a utility can reach a token and nothing else.

### Tokens

Contrast figures are measured against `--bg`.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#06070c` | The ground, and the exact color the field fades to. |
| `--text` | `#e8eaf6` | Primary ink, 16.5:1. |
| `--text-muted` | `#a9aec6` | Secondary ink, 9.0:1. Nothing is set dimmer than this. |
| `--surface`, `--surface-strong` | `rgba(13,15,26,.86)`, `#0d0f1a` | What a panel is made of. The strong one is opaque, for anything that floats over other content (a dialog, a menu). |
| `--well`, `--knob` | `rgba(2,3,7,.62)`, `#e8eaf6` | The cut of an input or a badge; the small moving part of a control. |
| `--line`, `--line-strong` | `rgba(232,234,246,.11)`, `.24` | The hairline every panel carries, and its stronger step for wells and hover. |
| `--accent`, `--accent-strong` | `#8f7dff`, `#a99bff` | The single accent: the primary action, focus, and active markers. 6.1:1 as text. Filled controls carry dark ink (`--on-accent`, 6.1:1 on the accent); white would not pass. |
| `--danger` | `#ff8a8a` | Errors and destructive actions only, always with an icon and text. An ink, never a fill. 8.6:1. |
| `--drift` | `#ff8279` | A portfolio past its band, the same warm tone the rings take on. Always beside a label that says so. 7.6:1. |
| `--depth` | `1` (`0.75` up to 40rem, `0.6` up to 24rem) | One multiplier on every shadow distance, so panels sit lower on small screens. |
| `--raised-sm/md/lg`, `--pressed-sm/md/lg`, `--flat` | three aligned layers each: edge, inner tone, cast shadow | The depth levels. Because the layers line up, a control eases from raised to pressed. |
| `--radius-sm/md/lg/xl/pill` | `0.5 / 0.75 / 1.125 / 1.5rem / 999px` | Wells and chips, inputs, cards, large panels, buttons and badges. |
| `--text-xs` to `--text-display`, `--text-instrument` | modular scale, ratio 1.25, fluid from `xl` up | Type. Zalando Sans Expanded for headings, Zalando Sans for body, JetBrains Mono with tabular figures for numerals, addresses, hashes, and small caps labels. |
| `--space-1` to `--space-24`, `--space-gutter/section/card` | 4px-based scale, fluid layout aliases | Spacing. |
| `--duration-fast/base/settle`, `--ease-settle`, `--ease-fade` | `150 / 250 / 1100ms` | Motion. One curve; everything that moves settles on it. |
| `--focus-width/offset/color` | `2px / 3px / accent` | The focus ring, shared by every interactive element. |
| `--glow-opacity/blur/hold` (and `-in`, `-out`, `-reach`, `-static-opacity`) | `0.75 / 0.22em / 1500ms`; `0.45 / 0.15em` up to 40rem | The headline glow: intensity, spread, and how long a letter stays lit. Gentler on small screens so letter edges stay crisp. |

### The background

Hand-written WebGL 1, no library: about 23 KB of JavaScript in the production build (10 KB gzipped), in two chunks loaded on idle after first paint, so it never delays the largest paint. It is mounted once, in `app/layout.tsx`, and persists across pages.

- What is drawn: three layers of rings at different depths around a nucleus, and particles travelling along them. While a portfolio is drifting the rings buckle and warm and the particles are carried off their rings, each still held by a thread. A rebalance sends one ring out from the nucleus, and behind it every particle is back on its ring.
- The page tells the field what to show through markup, never the other way round:
  - `data-chapter="<n>"` on a section picks one of the five scenes in `CHAPTERS` (`annuli.ts`); the field eases between them with the scroll. Add `data-chapter-name` to show the chapter in the marker.
  - `data-quiet` on a block of text makes the field go quiet behind it, with a soft falloff. The four largest blocks in view are used. Text that sits directly on the field needs this to hold its contrast; text on a panel does not. The same attribute gives the block a feathered shade in CSS for whenever the still picture is showing instead of the scene (`background.css`), so the contrast holds in every fallback too.
  - `useBackground()` returns `setState("balanced" | "drifting")` and `pulse()`. The state is only ever what `setState` last said; `pulse()` sends one ring across the field and changes nothing else. The current state is also written on the canvas as `data-state`.
- In `/app` the same field runs much quieter: lower brightness, fewer particles, no change with scroll, stronger dimming behind content. `components/app/portfolio-field.tsx` ties it to the dashboard's existing hook results and nothing else. While the rebalance check calls for a rebalance (it is ready, or it is held back only by the cooldown, the pool's liquidity, or its cost) the field drifts, by turning warm. Otherwise it is calm, and that includes holding more of the buy asset than the target, however far: the contract only trades in one direction, so nothing is due there. A submitted rebalance sends one pulse; whether the field then settles is decided by the next check, so a failed submission, or one that leaves the portfolio past its band, never looks like balance. The field is never the only cue: the same state is always on screen as a badge, a figure, and the rebalance panel's text.
- Performance: the canvas resolution follows the measured frame time, in steps, down to half and back up. It stops when the tab is hidden, when the user pauses it, and for good (handing back to the still picture) if the device cannot hold a usable rate even at the floor. Software renderers are refused.
- Fallbacks: a still frame of the field (`public/background/annuli-{640,1280,1920}.{avif,webp}`, 17 to 57 KB) is the first paint on every page, and all there is without WebGL, under `prefers-reduced-motion`, or on a refused renderer. Under `forced-colors` neither is shown.
- Pause: a visible control in the header, the footer, and the app shell (WCAG 2.2.2). The choice is remembered across pages in `localStorage`, and the control still works where storage is refused. A paused scene stops completely: time does not pass and the scene does not change with the scroll. Only the quiet zones are redrawn, so they stay under the text as the page moves.
- The canvas never takes clicks or focus, and the page scrolls natively.

To re-export the stills after changing the scene, open `/dev/ui?bg=annuli&bare` in development (the field alone, with the engine on `window.__bg`). At 640x1136, 1280x800, and 1920x1200: stop the clock (`setManual(true)`), turn the grain off (`setLook({ grain: 0 })`), take the pointer away (`setPointer(point, 0)`), draw the opening frame (`step(0)`), save the canvas, and encode it to AVIF and WebP.

### Retuning

- Ground: change `--bg`, and the `GROUND` constant in `components/background/annuli.ts` to match, then re-export the stills. Keep it very dark: the panels and every contrast figure above assume it.
- Accent: change `--accent` and `--accent-strong` together. It must stay at or above 4.5:1 against `--bg`, and `--on-accent` at or above 4.5:1 against it. The ring colors per chapter are the `accent` entries in `CHAPTERS`.
- How bright the field is: the scenes' `density` and `accent`, and in `/app` the calm factor in the fragment shader. After any change, re-measure text contrast over the brightest frame at 360, 768, and 1280.
- After a token change, open the Tokens tab of the gallery (below): it reads the live values back from the page and shows each color's measured contrast.
- Depth: `--depth` scales every shadow at once; the `--elev-*` distances set the three levels.

### Accessibility

A panel's edge is 1.3:1 against the ground, far too faint to carry meaning, so no state is ever shown by an edge or a shadow alone. Current and selected items take the accent and a marker; errors take the danger ink, an icon, and text; drift takes the drift ink, a dot, and a label; disabled is opacity and a not-allowed cursor; a busy button keeps full contrast and shows a spinner. Every interactive element draws the same accent focus ring on keyboard focus. Text over the field is measured over its brightest frame: body text at least 4.5:1, large text at least 3:1. Nothing flashes. Under `prefers-reduced-motion` state changes are instant and the field is a still; under `prefers-contrast: more` panels turn opaque and every edge strengthens; under `forced-colors` the field is removed and borders come back in system colors.

### Gallery

`/dev/ui` shows every token, every primitive, and every app screen in every state (loading, empty, error, success, balanced, drifting) from mock data, with no wallet and no network. The dashboard's states include the drift readout at its extremes (`?screen=dashboard&state=drift-band-200` and its neighbours): drift from -50% to +50% at three band widths, and the longest figures it can be asked to show. `/dev/ui?bg=annuli` is the background on its own with controls for its states. It exists in development only: the route is a 404 in a production build and is marked `noindex`.
