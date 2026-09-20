"use client";

import { useEffect, useRef, useState } from "react";
import { easeSettle } from "./ease";

const DRIFT_START_BPS = 41.3;

// getComputedStyle serializes a custom property holding a CSS <time> back
// as authored by the engine, not as authored in globals.css: a value of
// 1100ms round-trips as "1.1s". Parsing the number alone, without the
// unit, would read that as 1.1 milliseconds and collapse the whole
// animation into a single frame, so the unit has to be read explicitly.
function readDurationMs(variableName: string, fallback: number) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return raw.endsWith("ms") ? value : value * 1000;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The drift and settle demonstration: a marker sitting off its target
 * position on the horizon line, and the drift figure beside it, both
 * easing back to true together, on the signature curve, over the same
 * settle duration. This is the physical center of the motion identity, so
 * it is built once here rather than as a generic animation utility.
 */
export function DriftSettle() {
  const [play, setPlay] = useState(0);

  return (
    <div className="flex flex-col items-center gap-8">
      <Instrument key={play} />

      <button
        type="button"
        onClick={() => setPlay((n) => n + 1)}
        className="text-sm text-panel-text/70 underline decoration-panel-border underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-panel-text"
      >
        Replay
      </button>
    </div>
  );
}

function Instrument() {
  const [settled, setSettled] = useState(false);
  const [driftBps, setDriftBps] = useState(DRIFT_START_BPS);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      const resolveTimeout = setTimeout(() => {
        setSettled(true);
        setDriftBps(0);
      }, 0);
      return () => clearTimeout(resolveTimeout);
    }

    const settleMs = readDurationMs("--duration-settle", 1100);

    const startTimeout = setTimeout(() => {
      setSettled(true);
      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min((now - start) / settleMs, 1);
        const eased = easeSettle(t);
        const next = DRIFT_START_BPS * (1 - eased);
        setDriftBps(t < 1 ? next : 0);
        if (t < 1) {
          frameRef.current = requestAnimationFrame(tick);
        }
      };

      frameRef.current = requestAnimationFrame(tick);
    }, 150);

    return () => {
      clearTimeout(startTimeout);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const displayBps = driftBps > 0 ? `+${driftBps.toFixed(2)}` : "0.00";

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="relative w-full max-w-md py-10">
        {/* The horizon: the fine hairline the marker pivots around. */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-panel-border" />

        {/* The target tick: dead center, the level the marker settles to. */}
        <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-panel-text/40" />

        {/* The marker: drifts off level, then eases back on ease-settle. */}
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-transform duration-[var(--duration-settle)] ease-[var(--ease-settle)]"
          style={{
            transform: settled
              ? "translate(0px, 0px) rotate(0deg)"
              : "translate(38px, -14px) rotate(-7deg)",
          }}
        >
          <span
            className={`block h-4 w-4 rounded-full border transition-colors duration-[var(--duration-settle)] ease-[var(--ease-settle)] ${
              settled
                ? "border-accent bg-accent"
                : "border-panel-text/50 bg-surface-raised"
            }`}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-panel-text">Target weight drift</span>
        <span
          className={`w-24 font-mono tabular-nums transition-colors duration-[var(--duration-settle)] ${
            settled ? "text-accent" : "text-panel-text"
          }`}
        >
          {displayBps} bps
        </span>
      </div>
    </div>
  );
}
