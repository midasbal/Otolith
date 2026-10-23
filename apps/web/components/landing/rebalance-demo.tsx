"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useBackground } from "@/components/background/background";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";
import { DemoAction } from "./demo-action";

/*
  The product's one move, by hand, on an example portfolio.

  Two things are shown and kept apart. The target split is the visitor's
  setting: the notch on the dial's rim, with the band marked either
  side, and the ring's knob dragged round (or moved with the keyboard)
  sets it. The current split is what the portfolio holds: the ring's two
  arcs, the figure in its middle, and the key under it. The gap between
  where the arcs meet and the notch is the drift.

  "Let it drift" carries the current split away from the target, past
  the band; "Rebalance" brings it back. The arcs, the figures, the scale
  under the dial and the page's background all move together, and the
  same number is behind every one of them: drift is the current share of
  the first asset less its target share.

  Each asset has one color everywhere. The drift color is kept for being
  past the band: the stretch of arc between the notch and the current
  split, the dot on the scale, and the line of text.

  It is an example and says so. Everything here is local to this file:
  the target is component state that starts at 50/50 and is gone on
  reload, and the drift and band are fixed illustrative figures. Nothing
  is read from a wallet, a contract, or the network, and nothing is
  stored.
*/

const SELL_SYMBOL = "XLM";
const BUY_SYMBOL = "USDC";

// The slider's value: XLM's share of the target, in whole percent. USDC's
// share is always the remainder.
const MIN_PERCENT = 5;
const MAX_PERCENT = 95;
const STEP_PERCENT = 1;
const PAGE_PERCENT = 10;
const DEFAULT_PERCENT = 50;

// Fixed, illustrative figures. At rest the knob sits just past the target
// notch, inside the band ticks; drifted, well outside them. The drawing
// agrees with the readout either way.
const BAND_PERCENT = 2;
const RESTING_DRIFT = 0.2;
const DRIFTED = 3.8;

type Phase = "balanced" | "drifting" | "rebalanced";

// How long the current split takes to drift away, and to come back: slow out, quick home.
const DRIFT_MS = 2400;
const RETURN_MS = 900;
// The scale under the dial runs this many bands either side of the target.
const SCALE_BANDS = 3;

const STATUS: Record<Phase, { drift: number; text: string }> = {
  balanced: { drift: RESTING_DRIFT, text: "Within band" },
  drifting: { drift: DRIFTED, text: "Past band: a rebalance is due" },
  rebalanced: { drift: RESTING_DRIFT, text: "Rebalanced: back within band" },
};

// Geometry in the SVG's 100-unit box, which covers the whole plate (see
// landing.css): the groove runs from radius 25 to 41, so both arcs ride
// at 33. The ticks sit on the plate's rim, outside the groove. Lengths
// along the ring are in percent of its circumference, since the circles
// are drawn with pathLength 100.
const ARC_RADIUS = 33;
const ARC_WIDTH = 9;
const REST_WIDTH = 3;
const KNOB_RADIUS = 6.5;
const CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;
const ARC_CAP = (ARC_WIDTH / 2 / CIRCUMFERENCE) * 100;
const REST_CAP = (REST_WIDTH / 2 / CIRCUMFERENCE) * 100;
const KNOB_HALF = (KNOB_RADIUS / CIRCUMFERENCE) * 100;
const RING_GAP = 1.2;

const fixed = (value: number) => value.toFixed(3);

// Figures are padded to a fixed width with no-break spaces, which in the
// tabular face are exactly one digit wide. Every figure on the dial is
// then the same width at every split, so none of them moves as it changes.
const figure = (value: number) => String(value).padStart(2, "\u00a0");
const share = (value: number) => value.toFixed(1).padStart(4, "\u00a0");

/**
 * The ring for a given target and drift: the accent arc runs from the top
 * round to the share held (target plus drift), where the knob sits; the
 * thin arc is the remainder, kept clear of the knob and of the top.
 */
function ringFor(target: number, drift: number) {
  const held = target + drift;
  const arc = Math.max(0, held - 2 * ARC_CAP);
  const restStart = held + KNOB_HALF + RING_GAP + REST_CAP;
  const rest = Math.max(0, 100 - RING_GAP - REST_CAP - restStart);

  return {
    knob: `${fixed(held * 3.6)}deg`,
    arc: `${fixed(arc)} ${fixed(100 - arc)}`,
    rest: `${fixed(rest)} ${fixed(100 - rest)}`,
    restOffset: fixed(-restStart),
    hasRest: rest > 0,
  };
}

function snapPercent(value: number): number {
  const stepped = Math.round(value / STEP_PERCENT) * STEP_PERCENT;
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, stepped));
}

/** Where a pointer is round the ring: percent of a full turn, clockwise from the top. */
function turnAt(event: PointerEvent<HTMLElement>, dial: HTMLElement): number {
  const rect = dial.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  return (((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 3.6;
}

/** The shorter way round from one point on the ring to another, signed, in percent of a turn. */
function shorterWay(delta: number): number {
  return ((((delta + 50) % 100) + 100) % 100) - 50;
}

function Tick({ degrees, kind }: { degrees: number; kind: "target" | "band" }) {
  const inner = kind === "target" ? 43.5 : 44.5;
  const outer = kind === "target" ? 47.5 : 46.5;
  return (
    <line
      x1={50 + inner}
      y1="50"
      x2={50 + outer}
      y2="50"
      strokeWidth={kind === "target" ? 1.75 : 1.25}
      transform={`rotate(${degrees} 50 50)`}
      data-kind={kind}
      className="ot-dial-tick"
    />
  );
}

export function RebalanceDemo() {
  const background = useBackground();
  const [phase, setPhase] = useState<Phase>("balanced");
  const [sellPercent, setSellPercent] = useState(DEFAULT_PERCENT);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  // The drift as it is shown, on its way to the drift the phase says: every
  // moving thing (arcs, knob, figures, scale) is drawn from this one
  // number, so they cannot disagree. With less motion asked for it snaps.
  const [eased, setEased] = useState(RESTING_DRIFT);
  const shown = useRef(RESTING_DRIFT);
  // True while the knob holds focus because a pointer pressed it. The
  // focus ring is the keyboard's: a press focuses the knob by script,
  // which a browser may count as keyboard focus, so the ring is held back
  // until a key is actually used.
  const [pointerFocus, setPointerFocus] = useState(false);
  const buyPercent = 100 - sellPercent;
  const status = STATUS[phase];
  const past = phase === "drifting";

  const dialRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  // The pointer that is dragging, and how far round from the knob's own
  // position it took hold, so the knob does not jump under it.
  const drag = useRef<{ pointerId: number; offset: number } | null>(null);

  useEffect(() => {
    const to = STATUS[phase].drift;
    const from = shown.current;
    if (from === to) return;
    if (reducedMotion) {
      shown.current = to;
      return;
    }
    const length = to > from ? DRIFT_MS : RETURN_MS;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / length);
      // Settles like everything else here: quick away, slow to rest.
      shown.current = from + (to - from) * (1 - (1 - t) ** 3);
      setEased(shown.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, reducedMotion]);

  const drift = reducedMotion ? status.drift : eased;
  // On its way: the ring follows the number frame by frame, with nothing easing behind it.
  const moving = drift !== status.drift;
  const ring = ringFor(sellPercent, drift);
  const sellNow = sellPercent + drift;
  const buyNow = 100 - sellNow;
  const pastNow = Math.abs(drift) > BAND_PERCENT;
  // Where the drift sits on the scale under the dial, and whether it is off its end.
  const reach = BAND_PERCENT * SCALE_BANDS;
  const scaleAt = (value: number) => 50 + (Math.max(-reach, Math.min(reach, value)) / reach) * 50;
  const offScale = Math.abs(drift) > reach;

  // The ring is the control. A press on the knob picks it up where it is;
  // a press anywhere else on the track brings the knob there first. Either
  // way the pointer is then captured by the knob, so the drag keeps
  // following it outside the ring and always ends when it is released,
  // wherever that happens, or if the capture is lost.
  const startDrag = (event: PointerEvent<HTMLElement>, from: "knob" | "track") => {
    const dial = dialRef.current;
    const knob = knobRef.current;
    if (!dial || !knob || drag.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    setPointerFocus(true);
    knob.focus({ preventScroll: true });
    knob.setPointerCapture(event.pointerId);

    const at = turnAt(event, dial);
    if (from === "knob") {
      drag.current = { pointerId: event.pointerId, offset: shorterWay(at - (sellPercent + drift)) };
    } else {
      drag.current = { pointerId: event.pointerId, offset: 0 };
      setSellPercent(snapPercent(at - drift));
    }
  };

  const handleKnobMove = (event: PointerEvent<HTMLSpanElement>) => {
    const dial = dialRef.current;
    if (!dial || drag.current?.pointerId !== event.pointerId) return;

    const at = (((turnAt(event, dial) - drag.current.offset) % 100) + 100) % 100;
    const next = snapPercent(at - drift);

    // The range is open at the top of the ring, between its two ends. A
    // drag that crosses the top would jump from one end to the other;
    // hold the value at the end it reached instead.
    setSellPercent((current) => (Math.abs(next - current) > 50 ? current : next));
    setDragging(true);
  };

  const endDrag = (event: PointerEvent<HTMLSpanElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  // The slider's keys: arrows step by one, Page Up and Page Down by ten,
  // Home and End go to the ends of the range.
  const handleKnobKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    setPointerFocus(false);
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = sellPercent + STEP_PERCENT;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = sellPercent - STEP_PERCENT;
        break;
      case "PageUp":
        next = sellPercent + PAGE_PERCENT;
        break;
      case "PageDown":
        next = sellPercent - PAGE_PERCENT;
        break;
      case "Home":
        next = MIN_PERCENT;
        break;
      case "End":
        next = MAX_PERCENT;
        break;
      default:
        return;
    }

    event.preventDefault();
    setSellPercent(snapPercent(next));
  };

  return (
    <Card className="ot-demo" data-phase={phase}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge>Example</Badge>
        <p className="ot-caps">Drift simulator</p>
      </div>

      <div className="ot-demo-body">
        <div role="group" aria-label="Example allocation, try adjusting the target split" className="ot-demo-dial">
          <div
            ref={dialRef}
            className="ot-dial"
            data-dragging={dragging ? "true" : undefined}
            data-moving={moving ? "true" : undefined}
            data-out={pastNow ? "true" : undefined}
            style={{ "--dial-target": `${fixed(sellPercent * 3.6)}deg`, "--dial-knob": ring.knob } as CSSProperties}
          >
            <div aria-hidden="true" className="ot-dial-plate" />
            {/* The groove is the slider's track: a press on it brings the knob
                round to that point. The arcs drawn over it let the pointer
                through, and the cap covers its middle, so only the ring
                itself takes hold of a pointer. */}
            <div aria-hidden="true" className="ot-dial-groove" onPointerDown={(event) => startDrag(event, "track")} />

            <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="ot-dial-svg">
              <circle
                cx="50"
                cy="50"
                r={ARC_RADIUS}
                pathLength={100}
                strokeWidth={REST_WIDTH}
                className="ot-dial-rest"
                style={{ strokeDasharray: ring.rest, strokeDashoffset: ring.restOffset, opacity: ring.hasRest ? 1 : 0 }}
              />
              <circle
                cx="50"
                cy="50"
                r={ARC_RADIUS}
                pathLength={100}
                strokeWidth={ARC_WIDTH}
                className="ot-dial-arc"
                style={{ strokeDasharray: ring.arc, strokeDashoffset: fixed(-ARC_CAP) }}
              />
              {/* The drift itself: the stretch of ring between the target and the current split. It shows, in the
                  drift color, only while that stretch is longer than the band. */}
              <circle
                cx="50"
                cy="50"
                r={ARC_RADIUS}
                pathLength={100}
                strokeWidth={ARC_WIDTH}
                className="ot-dial-drift"
                style={{ strokeDasharray: `${fixed(Math.max(0, drift))} ${fixed(100 - Math.max(0, drift))}`, strokeDashoffset: fixed(-sellPercent) }}
              />
              <g className="ot-dial-ticks">
                <Tick degrees={-BAND_PERCENT * 3.6} kind="band" />
                <Tick degrees={0} kind="target" />
                <Tick degrees={BAND_PERCENT * 3.6} kind="band" />
              </g>
            </svg>

            <div className="ot-dial-orbit">
              <span
                ref={knobRef}
                role="slider"
                tabIndex={0}
                aria-label="Target split"
                aria-valuemin={MIN_PERCENT}
                aria-valuemax={MAX_PERCENT}
                aria-valuenow={sellPercent}
                aria-valuetext={`Target ${sellPercent}% ${SELL_SYMBOL}, ${buyPercent}% ${BUY_SYMBOL}. Current ${(sellPercent + status.drift).toFixed(1)}% ${SELL_SYMBOL}, ${(buyPercent - status.drift).toFixed(1)}% ${BUY_SYMBOL}.`}
                className="ot-dial-knob"
                data-pointer-focus={pointerFocus ? "true" : undefined}
                onKeyDown={handleKnobKeyDown}
                onBlur={() => setPointerFocus(false)}
                onPointerDown={(event) => startDrag(event, "knob")}
                onPointerMove={handleKnobMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
              />
            </div>

            <div aria-hidden="true" className="ot-dial-cap">
              <span className="ot-caps">Current</span>
              <span className="ot-num ot-dial-value">
                {share(sellNow)} / {share(buyNow)}
              </span>
              <span className="ot-caps">
                {SELL_SYMBOL} / {BUY_SYMBOL}
              </span>
              <span className="ot-dial-target">
                Target{" "}
                <span className="ot-num">
                  {figure(sellPercent)} / {figure(buyPercent)}
                </span>
              </span>
            </div>
          </div>

          {/* Which arc is which, and the two shares. The slider announces the
              same two figures as its value text, so they are not read out a
              second time. */}
          <div aria-hidden="true" className="ot-dial-legend">
            <span>
              <span className="ot-dial-key" data-asset="sell" />
              {SELL_SYMBOL}
              <span className="ot-num ot-dial-percent">{share(sellNow)}%</span>
              <span className="ot-dial-aim">
                · target <span className="ot-num">{figure(sellPercent)}%</span>
              </span>
            </span>
            <span>
              <span className="ot-dial-key" data-asset="buy" />
              {BUY_SYMBOL}
              <span className="ot-num ot-dial-percent">{share(buyNow)}%</span>
              <span className="ot-dial-aim">
                · target <span className="ot-num">{figure(buyPercent)}%</span>
              </span>
            </span>
          </div>
        </div>

        <div className="ot-demo-readout">
          {/* The drift on a scale: the target in the middle, the band marked either side, and room beyond it, so a
              drift past the band still has somewhere to stand. Off the end of the scale it is held at the end with an
              arrow, never silently. The line under it says the same in words, so the scale is not announced. */}
          <div aria-hidden="true" className="ot-demo-scale" data-out={pastNow ? "true" : undefined}>
            <span className="ot-caps">Drift</span>
            <div className="ot-demo-scale-track">
              <span className="ot-demo-scale-band" style={{ left: `${scaleAt(-BAND_PERCENT)}%`, right: `${100 - scaleAt(BAND_PERCENT)}%` }} />
              {[-BAND_PERCENT, 0, BAND_PERCENT].map((mark) => (
                <span key={mark} className="ot-demo-scale-mark" data-kind={mark === 0 ? "target" : "band"} style={{ left: `${scaleAt(mark)}%` }}>
                  <span className="ot-num">{mark === 0 ? "Target" : `${mark > 0 ? "+" : "-"}${Math.abs(mark)}%`}</span>
                </span>
              ))}
              <span className="ot-demo-scale-dot" style={{ left: `${scaleAt(drift)}%` }}>
                {offScale ? <Icon name="arrow-right" size={12} /> : null}
              </span>
            </div>
          </div>

          {/* One line, announced when it changes: the drift, what it means, and both splits in words. */}
          <p role="status" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="ot-num text-lg text-text">{status.drift.toFixed(2)}%</span>
            <span className={past ? "ot-demo-past text-sm" : "text-sm text-text-muted"}>
              {past ? <Icon name="alert" size={14} className="mr-1.5 inline-block align-[-2px]" /> : null}
              {status.text}
            </span>
            <span className="sr-only">
              Current {(sellPercent + status.drift).toFixed(1)}% {SELL_SYMBOL}, {(buyPercent - status.drift).toFixed(1)}% {BUY_SYMBOL}. Target {sellPercent}%{" "}
              {SELL_SYMBOL}, {buyPercent}% {BUY_SYMBOL}.
            </span>
          </p>

          <div className="flex flex-wrap gap-3">
            <DemoAction
              done={past}
              onPress={() => {
                setPhase("drifting");
                background.setState("drifting");
              }}
            >
              Let it drift
            </DemoAction>
            <DemoAction
              variant="primary"
              done={!past}
              onPress={() => {
                setPhase("rebalanced");
                background.setState("balanced");
                background.pulse();
              }}
            >
              Rebalance
            </DemoAction>
          </div>
        </div>
      </div>
    </Card>
  );
}
