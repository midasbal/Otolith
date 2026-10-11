"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { AllocationDonut } from "@/components/ui/allocation-donut";
import { Badge, TestnetBadge } from "@/components/ui/badge";
import { Button, ButtonLink, IconButton, TextButton, TextLink } from "@/components/ui/button";
import { Card, IconWell } from "@/components/ui/card";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Dialog } from "@/components/ui/dialog";
import { DriftGauge } from "@/components/ui/drift-gauge";
import { Field, Input } from "@/components/ui/field";
import { GlowText } from "@/components/ui/glow-text";
import { Icon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { EmptyState, ErrorState, LoadingState, Notice, Skeleton } from "@/components/ui/states";
import { Stepper, Tabs } from "@/components/ui/tabs";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { TxHash } from "@/components/ui/tx-hash";
import { RebalanceDemo } from "@/components/landing/rebalance-demo";
import { Logo, Mark } from "@/components/ui/mark";
import { ThemeToggle } from "@/components/ui/theme";
import { APP_SCREENS, AppScreenPreview, type AppState } from "./app-states";
import { LogoLab } from "./logo-lab";

/*
  The development gallery (see app/dev/ui/page.tsx for why it never
  reaches production). Everything on this page is mock data, defined in
  this file and in app-states.tsx: no wallet, no contract read, no
  network call.
*/

// ── Reading tokens back from the page ──────────────────────────────────
// The token tab shows each token's live value and its measured contrast,
// read from the stylesheet rather than copied here, so the reference
// cannot drift from tokens.css.

function subscribeNever() {
  return () => {};
}

function useToken(name: string): string {
  return useSyncExternalStore(
    subscribeNever,
    () => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    () => "",
  );
}

function parseHex(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  // The build may shorten #ffffff to #fff; widen it back before reading.
  const hex = match[1].length === 3 ? match[1].replace(/./g, "$&$&") : match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): string {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return "";
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return `${((light + 0.05) / (dark + 0.05)).toFixed(1)}:1`;
}

// ── Layout helpers ─────────────────────────────────────────────────────

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-lg font-medium text-text">{title}</h2>
        {note ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-4">{children}</div>;
}

// ── Tokens tab ─────────────────────────────────────────────────────────

function ColorToken({ name, on, role }: { name: string; on: string; role: string }) {
  const value = useToken(name);
  const against = useToken(on);
  return (
    <Card depth="sm" className="flex flex-col gap-3">
      <span
        aria-hidden="true"
        className="ot-raised-sm block h-16 rounded-md"
        style={{ backgroundColor: `var(${name})` }}
      />
      <div>
        <p className="ot-num text-sm text-text">{name}</p>
        <p className="ot-num text-xs text-text-muted">
          {value} {name === on ? "" : `· ${contrast(value, against)} on ${on}`}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{role}</p>
      </div>
    </Card>
  );
}

const SHADOW_LEVELS = [
  { className: "ot-raised-sm", token: "--raised-sm" },
  { className: "ot-raised", token: "--raised-md" },
  { className: "ot-raised-lg", token: "--raised-lg" },
  { className: "ot-flat", token: "--flat" },
  { className: "ot-pressed-sm", token: "--pressed-sm" },
  { className: "ot-pressed", token: "--pressed-md" },
  { className: "ot-pressed-lg", token: "--pressed-lg" },
];

const RADII = ["--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-pill"];

const TYPE_STEPS = [
  { className: "text-instrument", token: "--text-instrument", sample: "1,284.50", mono: true },
  { className: "text-display", token: "--text-display", sample: "Display" },
  { className: "text-2xl", token: "--text-2xl", sample: "Heading 2xl" },
  { className: "text-xl", token: "--text-xl", sample: "Heading xl" },
  { className: "text-lg", token: "--text-lg", sample: "Heading lg" },
  { className: "text-md", token: "--text-md", sample: "Lead paragraph, md" },
  { className: "text-base", token: "--text-base", sample: "Body copy, base" },
  { className: "text-sm", token: "--text-sm", sample: "Supporting copy, sm" },
  { className: "text-xs", token: "--text-xs", sample: "Labels and captions, xs" },
];

function TokenValue({ name }: { name: string }) {
  return <span className="ot-num text-xs text-text-muted">{useToken(name)}</span>;
}

function TokensTab() {
  return (
    <div className="flex flex-col gap-14">
      <Section
        title="Color"
        note="One surface, two inks, one accent, one danger. Contrast is measured live from the stylesheet against the token named beside it."
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ColorToken name="--bg" on="--bg" role="The one surface: page, cards, controls." />
          <ColorToken name="--text" on="--bg" role="Primary ink." />
          <ColorToken name="--text-muted" on="--bg" role="Secondary ink for supporting copy." />
          <ColorToken name="--accent" on="--bg" role="Primary action, focus, active state." />
          <ColorToken name="--accent-strong" on="--bg" role="Hover and pressed step of the accent." />
          <ColorToken name="--on-accent" on="--accent" role="Label on an accent fill." />
          <ColorToken name="--danger" on="--bg" role="Errors and destructive actions only. An ink, never a fill." />
          <ColorToken name="--danger-strong" on="--bg" role="Hover and pressed step of danger." />
        </div>
      </Section>

      <Section
        title="Shadow levels"
        note="Raised casts the pair outward, pressed casts it inward, flat casts nothing. Every level is the same four layers, so a control can ease from one to another."
      >
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-7">
          {SHADOW_LEVELS.map((level) => (
            <div key={level.token} className="flex flex-col items-center gap-3">
              <span aria-hidden="true" className={`${level.className} block h-20 w-full rounded-lg`} />
              <span className="ot-num text-xs text-text-muted">{level.token}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radii">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
          {RADII.map((radius) => (
            <div key={radius} className="flex flex-col items-center gap-3">
              <span
                aria-hidden="true"
                className="ot-raised-sm block h-16 w-full"
                style={{ borderRadius: `var(${radius})` }}
              />
              <span className="ot-num text-xs text-text">{radius}</span>
              <TokenValue name={radius} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type scale" note="Steps from xl upward are fluid between a phone and a wide desktop.">
        <Card className="flex flex-col gap-5">
          {TYPE_STEPS.map((step) => (
            <div key={step.token} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <span
                className={`${step.className} min-w-0 text-text ${step.mono ? "ot-num" : "font-display font-medium"}`}
              >
                {step.sample}
              </span>
              <span className="ot-num text-xs text-text-muted">{step.token}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Motion">
        <Card>
          <DataList>
            {["--duration-fast", "--duration-base", "--duration-settle", "--ease-settle"].map((token) => (
              <DataRow key={token} label={<span className="ot-num">{token}</span>}>
                <TokenValue name={token} />
              </DataRow>
            ))}
          </DataList>
        </Card>
      </Section>
    </div>
  );
}

// ── Components tab ─────────────────────────────────────────────────────

const MOCK_HASH = "3f1c9a7e52b84d06a1e7c4f9b2d5083e6a7f41c9d8e2b05a3c6f7e1d4b9a8c20";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// One row of the Select's list in each state it can be in.
const LIST_SPECIMEN = [
  { label: "At rest", selected: false, active: false, disabled: false },
  { label: "Highlighted", selected: false, active: true, disabled: false },
  { label: "Selected", selected: true, active: false, disabled: false },
  { label: "Selected and highlighted", selected: true, active: true, disabled: false },
  { label: "Unavailable", selected: false, active: false, disabled: true },
];

function ToastButtons() {
  const toast = useToast();
  return (
    <Row>
      <Button onClick={() => toast({ message: "Address copied." })}>Info toast</Button>
      <Button onClick={() => toast({ tone: "success", message: "Rebalance submitted." })}>Success toast</Button>
      <Button onClick={() => toast({ tone: "danger", message: "The passkey request was cancelled." })}>
        Error toast
      </Button>
    </Row>
  );
}

function ComponentsTab() {
  const [split, setSplit] = useState(60);
  const [advanced, setAdvanced] = useState(false);
  const [amount, setAmount] = useState("500");
  const [dialog, setDialog] = useState<"none" | "modal" | "sheet" | "select">("none");
  const [unit, setUnit] = useState("hours");

  return (
    <div className="flex flex-col gap-14">
      <Section
        title="Buttons"
        note="Secondary is the default. Primary is the one accent-filled control. Hover lifts, pressing sinks, and focus draws the accent ring."
      >
        <Row>
          <Button variant="primary">Open app</Button>
          <Button>See how it works</Button>
          <Button variant="danger">
            <Icon name="alert" size={16} />
            Confirm revoke
          </Button>
          <ButtonLink href="/dev/ui" variant="primary">
            Link as button
            <Icon name="arrow-right" size={16} />
          </ButtonLink>
        </Row>
        <Row>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="primary">Medium</Button>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button size="lg">Large</Button>
          <Button>Medium</Button>
          <Button size="sm">Small</Button>
        </Row>
        <Row>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="primary" loading>
            Submitting...
          </Button>
          <IconButton label="Copy">
            <Icon name="copy" size={18} />
          </IconButton>
          <IconButton label="Menu" size="sm">
            <Icon name="menu" size={16} />
          </IconButton>
          <TextButton>Text button</TextButton>
          <TextButton muted>Muted text button</TextButton>
          <TextLink href="https://stellar.expert" target="_blank" rel="noreferrer">
            External link
          </TextLink>
        </Row>
      </Section>

      <Section title="Badges">
        <Row>
          <TestnetBadge />
          <Badge>Within band</Badge>
          <Badge dot>Rebalance due</Badge>
        </Row>
      </Section>

      <Section title="Cards" note="Raised, pressed, and flat, on the same surface color as the page.">
        <div className="grid gap-6 sm:grid-cols-3">
          <Card className="flex flex-col gap-4">
            <IconWell>
              <Icon name="wallet" />
            </IconWell>
            <h3 className="font-display text-base font-medium">Raised card</h3>
            <p className="text-sm leading-relaxed text-text-muted">Lifts off the page. The default container.</p>
          </Card>
          <Card variant="pressed" className="flex flex-col gap-4">
            <IconWell raised>
              <Icon name="shield" />
            </IconWell>
            <h3 className="font-display text-base font-medium">Pressed card</h3>
            <p className="text-sm leading-relaxed text-text-muted">Sinks into the page. Wells and notices.</p>
          </Card>
          <Card variant="flat" className="flex flex-col gap-4">
            <IconWell>
              <Icon name="broadcast" />
            </IconWell>
            <h3 className="font-display text-base font-medium">Flat card</h3>
            <p className="text-sm leading-relaxed text-text-muted">Level with the page. Grouping without depth.</p>
          </Card>
        </div>
      </Section>

      <Section title="Fields" note="Inputs are inset wells, always under a visible label. The focus ring wraps the well.">
        <Card className="grid gap-6 sm:grid-cols-2">
          <Field label="Amount (TRY)" hint="Estimated from the anchor's live rate.">
            {(control) => (
              <Input
                {...control}
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                trailing="TRY"
              />
            )}
          </Field>
          <Field label="Drift band" error="Drift band must be between 0.10% and 20.00%.">
            {(control) => <Input {...control} type="number" defaultValue="42" trailing="%" />}
          </Field>
          <Field label="Disabled field">
            {(control) => <Input {...control} type="text" defaultValue="500" disabled trailing="TRY" />}
          </Field>
        </Card>
      </Section>

      <Section
        title="Select"
        note="A drop-in for a native select: same value, same onChange, same option children. The list is a raised panel of the page's own surface. Arrow keys move the highlight, Enter or Space choose, Escape and Tab leave the value alone, and typing a letter jumps to it."
      >
        <Card className="grid gap-6 sm:grid-cols-2">
          <Field label="Cooldown unit" hint={`Controlled. The value is "${unit}".`}>
            {(control) => (
              <Select {...control} value={unit} onChange={(event) => setUnit(event.target.value)}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </Select>
            )}
          </Field>
          <Field label="Slippage tolerance" hint="With a unit inside the well.">
            {(control) => (
              <Select {...control} defaultValue="1.00" trailing="%" className="ot-num">
                <option value="0.30">0.30</option>
                <option value="0.50">0.50</option>
                <option value="1.00">1.00</option>
                <option value="2.00">2.00</option>
              </Select>
            )}
          </Field>
          <Field label="Disabled select">
            {(control) => (
              <Select {...control} defaultValue="hours" disabled>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </Select>
            )}
          </Field>
          <Field label="Select with an error" error="Choose how often the policy may rebalance.">
            {(control) => (
              <Select {...control} defaultValue="days">
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </Select>
            )}
          </Field>
          <Field label="A longer list" hint="It scrolls, and one option cannot be chosen. Try typing J twice.">
            {(control) => (
              <Select {...control} defaultValue="June">
                {MONTHS.map((month) => (
                  <option key={month} value={month} disabled={month === "March"}>
                    {month}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="ot-field">
            <span className="ot-label">The list&rsquo;s rows</span>
            <p className="ot-hint">At rest, highlighted, selected, both at once, and unavailable.</p>
            {/* A still copy of the open list, for looking at: the same
                classes and attributes the real one sets, with no behavior. */}
            <ul
              role="listbox"
              aria-hidden="true"
              className="ot-listbox"
              data-open="true"
              style={{ position: "static", width: "100%", opacity: 1, transform: "none" }}
            >
              {LIST_SPECIMEN.map((row) => (
                <li
                  key={row.label}
                  role="option"
                  className="ot-option"
                  aria-selected={row.selected}
                  aria-disabled={row.disabled ? true : undefined}
                  data-active={row.active ? "true" : undefined}
                >
                  <span className="ot-option-label">{row.label}</span>
                  <Icon name="check" size={16} className="ot-option-check" />
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Row>
          <Button onClick={() => setDialog("select")}>Open a dialog with a select</Button>
        </Row>
        <Dialog
          open={dialog === "select"}
          onClose={() => setDialog("none")}
          title="Cooldown"
          description="The list opens above the dialog, and Escape closes the list before it closes the dialog."
          footer={
            <Button data-autofocus onClick={() => setDialog("none")}>
              Done
            </Button>
          }
        >
          <Field label="Cooldown unit">
            {(control) => (
              <Select {...control} value={unit} onChange={(event) => setUnit(event.target.value)}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </Select>
            )}
          </Field>
        </Dialog>
      </Section>

      <Section title="Slider and toggle">
        <Card className="flex flex-col gap-6">
          <div>
            <div className="flex items-center justify-between gap-4">
              <span className="ot-label">XLM</span>
              <span className="ot-num text-md text-accent">{split}%</span>
            </div>
            <Slider
              className="mt-3"
              min={0}
              max={100}
              step={1}
              value={split}
              onChange={(event) => setSplit(Number(event.target.value))}
              aria-label="XLM target percentage"
            />
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="ot-label">USDC</span>
              <span className="ot-num text-md text-accent">{100 - split}%</span>
            </div>
          </div>
          <div className="ot-divider" />
          <div className="flex items-center justify-between gap-4">
            <span id="gallery-advanced" className="ot-label">
              Advanced settings
            </span>
            <Toggle
              checked={advanced}
              onClick={() => setAdvanced((open) => !open)}
              aria-labelledby="gallery-advanced"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span id="gallery-disabled-toggle" className="ot-label">
              Disabled toggle
            </span>
            <Toggle checked disabled aria-labelledby="gallery-disabled-toggle" />
          </div>
        </Card>
      </Section>

      <Section title="Steps" note="A step indicator, not a control: the flow's own buttons move it.">
        <Stepper
          label="Setup progress"
          current="params"
          steps={[
            { id: "split", label: "Split" },
            { id: "params", label: "Parameters" },
            { id: "review", label: "Review" },
          ]}
          className="max-w-xl"
        />
      </Section>

      <Section title="Dialog, sheet, and toast">
        <Row>
          <Button onClick={() => setDialog("modal")}>Open dialog</Button>
          <Button onClick={() => setDialog("sheet")}>Open sheet</Button>
        </Row>
        <ToastButtons />
        <Dialog
          open={dialog === "modal"}
          onClose={() => setDialog("none")}
          title="Revoke this policy?"
          description="This needs one more passkey signature."
          footer={
            <>
              <Button data-autofocus onClick={() => setDialog("none")}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setDialog("none")}>
                <Icon name="alert" size={16} />
                Confirm revoke
              </Button>
            </>
          }
        />
        <Dialog open={dialog === "sheet"} onClose={() => setDialog("none")} title="Menu" variant="sheet">
          <nav aria-label="Gallery sheet" className="flex flex-col gap-2">
            <a href="#top" aria-current="page" className="ot-navlink">
              Dashboard
            </a>
            <a href="#top" className="ot-navlink">
              Activity
            </a>
            <a href="#top" className="ot-navlink">
              Settings
            </a>
          </nav>
        </Dialog>
      </Section>

      <Section title="Notices and states" note="Every state is an icon plus text. Danger adds its color to both.">
        <div className="grid gap-5 lg:grid-cols-2">
          <Notice>Otolith is live on Stellar testnet today.</Notice>
          <Notice tone="success" title="Rebalance submitted">
            No signature was needed from you.
          </Notice>
          <ErrorState message="Could not check whether a rebalance is due." onRetry={() => {}} />
          <Card depth="sm" className="flex flex-col gap-4">
            <LoadingState>Reading live prices...</LoadingState>
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </Card>
          <EmptyState icon="activity" className="lg:col-span-2">
            No rebalances in the recent window. Your rebalances will appear here once one happens.
          </EmptyState>
        </div>
      </Section>

      <Section title="Lists and tables">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <p className="ot-caps">Your policy</p>
            <DataList className="mt-2">
              <DataRow label="Target allocation">50.00% XLM / 50.00% USDC</DataRow>
              <DataRow label="Drift band">2.00%</DataRow>
              <DataRow label="Slippage tolerance">1.00%</DataRow>
              <DataRow label="Cooldown" numeric={false}>
                1 hour
              </DataRow>
            </DataList>
          </Card>
          <Card>
            <p className="ot-caps">Balances</p>
            <table className="ot-table mt-4">
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col" data-numeric>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>XLM</td>
                  <td data-numeric>9,412.5567</td>
                </tr>
                <tr>
                  <td>USDC</td>
                  <td data-numeric>1,284.5</td>
                </tr>
              </tbody>
            </table>
          </Card>
        </div>
      </Section>

      <Section
        title="Allocation and drift"
        note="The arc is the share held now and the notch is the target. On the gauge, the short notch is where a rebalance becomes due."
      >
        <Card className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
          <AllocationDonut
            share={0.462}
            target={0.5}
            label="46.20% of the portfolio is in USDC against a target of 50.00%."
            className="mx-auto"
          >
            <div>
              <p className="ot-num text-lg text-text">46.20%</p>
              <p className="ot-caps">USDC</p>
            </div>
          </AllocationDonut>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="ot-label">Drift</span>
              <Badge dot>Past band</Badge>
            </div>
            <p className="ot-num mt-1 text-lg text-text">-3.80%</p>
            <DriftGauge
              value={-380}
              notches={[{ at: -200, label: "-2.00%" }]}
              label="Drift is -3.80%, past the 2.00% band."
              className="mt-3"
            />
          </div>
        </Card>
      </Section>

      <Section
        title="Logo"
        note="One drawing at every size. The outlined half's line never thins below a visible one, and the integral is drawn a little heavier when the whole logo is small."
      >
        <div className="flex flex-wrap items-end gap-x-10 gap-y-6 text-text">
          <Logo title="Otolith" style={{ width: "24rem" }} />
          <Logo style={{ width: "10rem" }} />
          <Mark />
          <Logo style={{ width: "2.5rem" }} />
        </div>
      </Section>

      <Section
        title="Rebalance demo"
        note="The hero's dial and the drift simulator as one example: the ring sets the target split, the knob is where the holdings are. Not on the landing page yet."
      >
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <RebalanceDemo />
          <RebalanceDemo />
        </div>
      </Section>

      <Section title="Hash">
        <TxHash value={MOCK_HASH} className="max-w-2xl" />
      </Section>

      <Section
        title="Headline glow"
        note="Move the pointer across the line: each letter it passes is lit from beneath, held, then let go. Tune it with --glow-opacity, --glow-blur and --glow-hold in tokens.css. On touch it sweeps once; under reduced motion the marked words carry one still halo."
      >
        <p className="font-display text-2xl font-medium tracking-display text-text">
          <GlowText>
            <span data-glow-static="">Light pools</span> beneath the letters you pass.
          </GlowText>
        </p>
      </Section>

      <Section
        title="Select at the bottom edge"
        note="Scroll to the end of the page and open it: with no room below, the list opens upward, and it never leaves the viewport."
      >
        <Field label="Cooldown unit" className="max-w-xs">
          {(control) => (
            <Select {...control} defaultValue="hours">
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </Select>
          )}
        </Field>
      </Section>
    </div>
  );
}

const KIND_LABELS: Record<AppState["kind"], string> = {
  default: "State",
  loading: "Loading",
  empty: "Empty",
  error: "Error",
  success: "Success",
};

/** Where one app screen in one state can be opened on its own. */
function screenHref(screen: string, state: string, menu = false): string {
  return `/dev/ui?screen=${screen}&state=${state}${menu ? "&menu" : ""}`;
}

function ScreensTab() {
  return (
    <div className="flex flex-col gap-12">
      <p className="max-w-2xl text-base leading-relaxed text-text-muted">
        Each link opens one app screen in one state on its own, inside the chrome its real route has, fed by mock data
        instead of by the wallet and the chain. Nothing on those pages signs, sends, or reads anything.
      </p>

      {APP_SCREENS.map((screen) => (
        <Section key={screen.id} title={screen.label} note={screen.href}>
          <ul className="ot-datalist">
            {screen.states.map((state) => (
              <li key={state.id} className="ot-datarow">
                <TextLink href={screenHref(screen.id, state.id)}>{state.label}</TextLink>
                <Badge>{KIND_LABELS[state.kind]}</Badge>
              </li>
            ))}
            {screen.chrome ? (
              <li className="ot-datarow">
                <TextLink href={screenHref(screen.id, screen.states[screen.states.length - 1].id, true)}>
                  Menu sheet open (small screens)
                </TextLink>
                <Badge>State</Badge>
              </li>
            ) : null}
          </ul>
        </Section>
      ))}
    </div>
  );
}

type GalleryProps = {
  /** An app screen to show on its own, with `state`. */
  screen?: string;
  state?: string;
  /** The tab to open the gallery on. */
  tab?: string;
  /** Show the screen with its small-screen menu sheet open. */
  menu?: boolean;
  /** Show the background's lab full screen: the logo scene on its own. */
  background?: string;
  /** The lab with nothing over the scene. */
  bare?: boolean;
  /** The lab standing still at one of the scene's pictures (0 to 4), fitted to the window: for exporting the stills. */
  still?: string;
};

export function Gallery({ screen, state, tab, menu = false, background, bare = false, still }: GalleryProps) {
  if (background) {
    return <LogoLab bare={bare} still={still === undefined ? undefined : Number(still)} />;
  }

  const screenEntry = APP_SCREENS.find((entry) => entry.id === screen);
  const stateEntry = screenEntry?.states.find((entry) => entry.id === state) ?? screenEntry?.states[0];

  if (screenEntry && stateEntry) {
    return <AppScreenPreview screen={screenEntry} state={stateEntry} menuOpen={menu} />;
  }

  return (
    <ToastProvider>
      <main id="top" className="ot-container flex flex-col gap-10 py-12">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Badge>Development only</Badge>
            <ThemeToggle />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-display text-text">Otolith UI gallery</h1>
          <p className="max-w-2xl text-base leading-relaxed text-text-muted">
            Every token and primitive in the design system, and every app screen in every state, on mock data. This
            page is not built into production.
          </p>
        </header>

        <Tabs
          label="Gallery sections"
          defaultTab={tab === "tokens" || tab === "screens" ? tab : undefined}
          tabs={[
            { id: "components", label: "Components", content: <ComponentsTab /> },
            { id: "tokens", label: "Tokens", content: <TokensTab /> },
            { id: "screens", label: "App screens", content: <ScreensTab /> },
          ]}
        />
      </main>
    </ToastProvider>
  );
}
