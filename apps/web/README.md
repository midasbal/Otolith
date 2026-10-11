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

Ink on cream, the logo's own two colors, and the same two exchanged for the dark theme. The page is one flat ground; content sits on quiet panels, a shade lighter than the ground with a hairline edge, and inputs are wells cut into a panel. One violet accent marks the primary action, focus, and whatever is current. Behind the landing page the logo itself is the picture: it comes apart and back together as the page's five chapters scroll by.

Both themes ship. With no choice made the page follows the system setting, and light is what a browser with no preference gets. The toggle in the header (and in the app's sidebar and setup flow) overrides it and is remembered in `localStorage` under `otolith:theme`; an inline script in the document head applies a remembered choice before the first paint.

### Where it lives

| Path | What it holds |
| --- | --- |
| `app/styles/tokens.css` | Every color, shadow, radius, size, and timing value, for both themes. The only file to edit to retune the interface. |
| `app/styles/base.css` | The page itself: ground, ink, the focus ring, reduced motion. |
| `app/styles/components.css` | Every primitive's styles (`ot-*` classes), built only from the tokens. The logo's size-dependent line weights are here (`.ot-logo`). |
| `app/styles/background.css` | The canvas, the stage boxes the page keeps clear for the scene, the stills, and the pause control's reserved space. |
| `app/styles/glow.css`, `landing.css` | The headline glow; the landing page's chapters, level, and drift simulator with its allocation dial. |
| `components/logo/geometry.ts` | The logo as numbers: the one source every drawing of it reads (the SVG mark, the scene, the favicon). |
| `components/background/` | The background: `engine.ts` (the WebGL loop), `logo-scene.ts` (the scene), `logo-field.ts` (loads the integral's distance field), `background.tsx` (the provider, the page reader, the pause control, and `useBackground`). |
| `components/ui/` | The primitives as React components: Button, Card, Field, Input, Select, Slider, Toggle, Tabs, Stepper, Dialog, Toast, Notice, DataList, Badge, the logo and mark (`mark.tsx`), the theme toggle (`theme.tsx`), the level, the allocation donut and drift gauge. The gauge's labels are placed by arithmetic in the stylesheet (they are monospaced, so their widths are known), which keeps them apart and inside the track for any reading. |
| `components/landing/` | The chapter marker, and `rebalance-demo.tsx`: the drift simulator with its allocation dial, in "How it works". Its two buttons are `demo-action.tsx`: the one that is unavailable stays focusable, is marked `aria-disabled`, and takes a tick. |
| `components/app/` | The app's screens as presentational views. They take props and render; they call no data hooks and reach no chain code. |
| `app/app/**/page.tsx`, `components/*.tsx` | The containers: the hooks, state, and handlers, unchanged in behavior, handing their results to the views. |
| `public/logo/` | The scene's assets: `integral-field.png` (the integral sign's distance field, 13 KB) and three stills (`still-drift`, `still-return`, `still-bounds`, 48 to 64 KB each, fetched only where the scene cannot run). |

Tailwind is used for layout only. Its default palette and shadow scale are cleared in `tokens.css`, so a utility can reach a token and nothing else.

### Tokens

Contrast figures are measured against `--bg` in the same theme.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#f1ebe6` | `#0f0d0d` | The ground, and the exact color the scene is drawn on. |
| `--text` | `#231e1d`, 13.9:1 | `#f1ebe6`, 16.4:1 | Primary ink: the logo's ink, and its cream. |
| `--text-muted` | `#5d5552`, 6.2:1 | `#b5aca6`, 8.7:1 | Secondary ink. Nothing is set fainter than this. |
| `--surface`, `--surface-strong` | `rgba(250,247,243,.88)`, `#faf7f3` | `rgba(24,21,21,.88)`, `#181515` | What a panel is made of. The strong one is opaque, for anything that floats over other content (a dialog, a menu). |
| `--well`, `--knob` | `rgba(35,30,29,.055)`, `#ffffff` | `rgba(0,0,0,.5)`, `#f1ebe6` | The cut of an input or a badge; the small moving part of a control. |
| `--line`, `--line-strong` | ink at `.14`, `.3` | cream at `.11`, `.24` | The hairline every panel carries, and its stronger step for wells and hover. |
| `--accent`, `--accent-strong` | `#5a43e6`, `#4a34cf` | `#8f7dff`, `#a99bff` | The single accent: the primary action, focus, and active markers. 5.3:1 as text on light, 6.0:1 on dark. |
| `--on-accent` | `#ffffff`, 6.2:1 on the accent | `#0f0d0d`, 6.0:1 on the accent | The ink a filled control carries. |
| `--danger` | `#a8281f`, 5.9:1 | `#ff8a8a`, 8.5:1 | Errors and destructive actions only, always with an icon and text. An ink, never a fill. |
| `--drift` | `#a4471c`, 5.1:1 | `#ff8279`, 8.0:1 | A portfolio past its band. Always beside a label that says so. |

The rest are the same in both themes:

| Token | Value | Use |
| --- | --- | --- |
| `--depth` | `1` (`0.75` up to 40rem, `0.6` up to 24rem) | One multiplier on every shadow distance, so panels sit lower on small screens. |
| `--raised-sm/md/lg`, `--pressed-sm/md/lg`, `--flat` | three aligned layers each: edge, inner tone, cast shadow | The depth levels. Because the layers line up, a control eases from raised to pressed. |
| `--radius-sm/md/lg/xl/pill` | `0.5 / 0.75 / 1.125 / 1.5rem / 999px` | Wells and chips, inputs, cards, large panels, buttons and badges. |
| `--text-xs` to `--text-display`, `--text-instrument` | modular scale, ratio 1.25, fluid from `xl` up | Type. Zalando Sans Expanded for headings, Zalando Sans for body, JetBrains Mono with tabular figures for numerals, addresses, hashes, and small caps labels. |
| `--space-1` to `--space-24`, `--space-gutter/section/card` | 4px-based scale, fluid layout aliases | Spacing. |
| `--duration-fast/base/settle`, `--ease-settle`, `--ease-fade` | `150 / 250 / 1100ms` | Motion. One curve; everything that moves settles on it. |
| `--focus-width/offset/color` | `2px / 3px / accent` | The focus ring, shared by every interactive element. |
| `--glow-opacity/blur/hold` (and `-in`, `-out`, `-reach`, `-static-opacity`) | `0.75 / 0.22em / 1500ms`; `0.45 / 0.15em` up to 40rem | The headline glow: intensity, spread, and how long a letter stays lit. Gentler on small screens so letter edges stay crisp. |

### The logo

A filled half-disc standing on an axis, an outlined half-disc hanging from it, and an integral sign joining them: two assets out of balance, the target between them, and the flow that brings them level. `components/logo/geometry.ts` holds its numbers, traced from the artwork and cleaned (the two halves are the same circular segment, the integral is point-symmetric and centred on the axis). `<Logo>` and `<Mark>` (`components/ui/mark.tsx`) draw it as SVG at any size. The outlined half's line is 4 of the logo's 1700 units and never thinner than a visible line, and below about 400px wide the integral is drawn slightly heavier so its hairlines survive; both rules are in `.ot-logo`, measured against the logo's own width.

### Icons

`app/icon.svg` is the favicon: the logo set on the 16-pixel grid (the outline's line is one whole pixel row, the integral is thickened to a pixel), ink on nothing, turning cream when the browser's theme is dark. `app/favicon.ico` (16, 32, 48) is the same on a cream tile, for browsers that take no SVG favicon. `app/apple-icon.png` (180) and `public/icons/` (192, 512, and a 512 maskable with the logo inside the safe zone) are the logo on a cream square, listed in `app/manifest.ts`. All are drawn from the logo's own paths.

### The background

Hand-written WebGL 1, no library: about 29 KB of JavaScript in the production build (13 KB gzipped) and a 13 KB texture, loaded on idle after first paint, so it never delays the largest paint. It is mounted once, in `app/layout.tsx`, and draws behind the landing page and behind the app's dashboard.

- What is drawn: the logo, in particles (64,000; 26,000 on a touch device). Five pictures, one to a chapter: the logo whole and breathing; out of balance, as two vessels and the integral between them, the left one overfull and spilling, the right one all but empty, the whole leaning to the heavy side; level again, the integral uncoiled into a path the ink has poured along from the left vessel into the right; held, the axis widened into a band the whole flow runs inside; and the logo whole again, at rest. Which picture is shown is a function of how far down the chapters the page is, so scrolling back up rewinds it. Between two pictures a particle is carried by a current, and while it moves it draws a short trail.
- The pour has a pace of its own. The page only says how far it should have gone; the pour follows over a few seconds (`POUR_PACE`), however fast the page was scrolled, and a particle is two seconds on the path (`TRANSIT`). The highest ink leaves the left vessel first and comes to lie lowest in the right, so one level falls as the other rises, and every particle of the filled half is always in the left vessel, on the path, or in the right: nothing is made or lost. Scrolling back, or the simulator's "Let it drift", sends it back the same way. When the levels are where they should be the stream thins and stops, and the surfaces rock a little and come to rest.
- Under the particles lies the logo drawn exactly (arcs and lines by arithmetic, the integral from its distance field). Whole, it is the logo as it is: the left half solid, the right half a line. While the halves are vessels, from the moment the logo comes apart until it is whole again, both are drawn as that same thin line and the ink in them is the particles' alone; one fades into the other.
- The page tells the scene what to show through markup, never the other way round:
  - `data-chapter="<n>"` on a section says which of the five pictures is its own. Add `data-chapter-name` to show the chapter in the marker.
  - `data-stage` on an empty box inside that section is the room the page keeps clear for the picture (`.ot-stage`, in the logo's proportions). The scene fits the logo to it.
  - `data-quiet` on a block of text makes the scene go quiet behind it: each particle dims there, and the ground color is laid back over the block with a feathered edge. The four largest blocks in view are used. Text that sits directly on the ground needs this to hold its contrast; text on a panel does not.
  - `useBackground()` returns `setState("balanced" | "drifting")` and `pulse()`. It also returns `setLevel(ratio | null)`: what the portfolio holds of the asset it sells against what its target says (1 is on target). On the landing page the drift simulator uses the first two: while it says the example portfolio is drifting, the chapter where the logo levels shows it out of balance again, and a rebalance sends it back along the integral. What was last said is also written on the canvas as `data-state`, `data-level` and `data-pulses`.
- In `/app` the dashboard keeps one small stage beside its title, and the same logo is drawn there, calmer and with far fewer particles. `components/app/portfolio-field.tsx` ties it to the dashboard's existing hook results and nothing else. Until the portfolio is valued the logo is whole. Once it is, the halves are the two vessels and their levels are the valuation's own split against target: on target each is half full, holding too much of the asset it sells fills the left one, holding more of the buy asset than target fills the right one. While the rebalance check calls for a rebalance (it is ready, or held back only by the cooldown, the pool's liquidity, or its cost) the vessels are unsettled and lean; otherwise they are calm, and that includes being above target, however far, because the contract only trades one way. A submitted rebalance runs the path once, end to end; whether the levels then change is decided by the next valuation, so a failed submission, or one that leaves the portfolio past its band, never looks like balance. The stage sits inside the screen's quiet column, so the reader also reports where it is now and the scene is not dimmed inside it. It is decorative: the same state is always on screen as a badge, a figure, and the rebalance panel's text. The other app screens keep no stage and nothing is drawn behind them.
- The scene does not scroll with the page. Each chapter has one place on the screen: where its stage box is when the page stands at that chapter (the first with the page at its top, the last with the page at its end, the others with the chapter's top at the top of the screen). The picture is drawn there while the chapter is read and travels to the next chapter's place over the last stretch of scrolling before it. Drawing it wherever the box is from frame to frame would have it trail the page by a frame on every phone.
- First paint and fallbacks: the hero's stage holds the logo itself as an SVG, exactly where the scene draws it, so the scene takes over from it without a seam (the closing chapter's stage does the same). Where the scene cannot run (no WebGL, a software renderer, a device that cannot hold a usable rate) the SVG logos stay and each of the three chapters between shows a still of its picture in its stage: one image per picture, used as a mask over the text color, so the same file serves both themes. Under `prefers-reduced-motion` the scene itself is drawn, standing still: one picture to a chapter, exchanged as the page reaches it, and nothing moving in between. Under `forced-colors` nothing is run or drawn, and the SVG logos remain in the system's colors.
- Performance: the canvas resolution follows the measured frame time, in steps, down to half and back up. A frame rate that is held down by something other than the drawing (a browser saving battery, a phone's low power mode) is recognised: if the smallest buffer is no faster than the full one, the full one is restored. The scene stops when the tab is hidden, when the user pauses it, and for good if the device cannot hold a usable rate even at the floor. Software renderers are refused.
- Pause: a visible control in the landing page's header and footer and in the app's shell (WCAG 2.2.2). The choice is remembered across pages in `localStorage`, and the control still works where storage is refused. A paused scene stops where it is; from then on it shows each chapter's still as the page reaches it, as under reduced motion.
- The canvas never takes clicks or focus, and the page scrolls natively.

The scene's assets are made in the lab, `/dev/ui?bg=logo`, in development:

- The integral's distance field: `window.__buildLogoField()` returns it as a PNG data URL, to save over `public/logo/integral-field.png`. Rebuild it only if the integral's outline in `geometry.ts` changes.
- The stills: open `/dev/ui?bg=logo&still=1` (then `2`, `3`) in the light theme in a 1020x432 window; `window.__exportStill()` returns that picture as a WebP data URL (ink as opacity), to save over `public/logo/still-drift.webp`, `still-return.webp`, `still-bounds.webp`. Re-export them after changing how those pictures look.

### Retuning

- Ground and ink: change `--bg` and `--text` in both themes, and the `LIGHT` and `DARK` constants in `components/background/logo-scene.ts` to match (and `GROUND` and `INK` in the lab if the light pair changes, then re-export the stills).
- Accent: change `--accent` and `--accent-strong` together, per theme. It must stay at or above 4.5:1 against `--bg`, and `--on-accent` at or above 4.5:1 against it.
- How strongly the scene shows behind text: `DIM_REACH`, `VEIL_REACH` and the veil's strength in `logo-scene.ts`. Keep the reach shorter than the gap the page leaves between text and a stage, or the logo is dimmed where it stands. After any change, re-measure text contrast over the scene at 360, 768, and 1280 in both themes, moving, paused, and with reduced motion.
- Trails: `TRAIL_SECONDS` and `TRAIL_MAX` in `logo-scene.ts`. The pour: `POUR_PACE` (how quickly it follows the page), `TRANSIT` (seconds on the path; keep it under `PAST * STEP`, the time the scene remembers), `POUR_AT_DRIFT` (what already lies in the right vessel while out of balance), `LEAN`.
- After a token change, open the Tokens tab of the gallery (below): it reads the live values back from the page and shows each color's measured contrast.
- Depth: `--depth` scales every shadow at once; the `--elev-*` distances set the three levels.

### Accessibility

A panel's edge is far too faint to carry meaning, so no state is ever shown by an edge or a shadow alone. Current and selected items take the accent and a marker; errors take the danger ink, an icon, and text; drift takes the drift ink, a dot, and a label; disabled is a shape, not a paler color (the fill and shadow go, a dashed outline stays, the label keeps a readable ink), with a not-allowed cursor and `aria-disabled`; a busy button keeps full contrast and shows a spinner. Every interactive element draws the same accent focus ring on keyboard focus. Text over the scene is measured over its densest frames in both themes: body text at least 4.5:1, large text at least 3:1. Nothing flashes. Under `prefers-reduced-motion` state changes are instant and the scene stands still; under `prefers-contrast: more` panels turn opaque and every edge strengthens; under `forced-colors` the scene is removed and borders come back in system colors.

### Gallery

`/dev/ui` shows every token, every primitive, and every app screen in every state (loading, empty, error, success, balanced, drifting) from mock data, with no wallet and no network, in either theme (the toggle is at the top). The dashboard's states include the drift readout at its extremes (`?screen=dashboard&state=drift-band-200` and its neighbours): drift from -50% to +50% at three band widths, and the longest figures it can be asked to show. `/dev/ui?bg=logo` is the scene on its own. It exists in development only: the route is a 404 in a production build and is marked `noindex`.
