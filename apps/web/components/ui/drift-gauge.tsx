import type { CSSProperties } from "react";
import { cn } from "./cn";

export type GaugeNotch = {
  /** Where the notch sits, in the same unit as `value`. */
  at: number;
  /** Shown under the notch. */
  label: string;
};

type DriftGaugeProps = {
  /** The reading: distance from target, negative below it. */
  value: number;
  /** Thresholds to mark on the track, such as the edge of the band. */
  notches?: GaugeNotch[];
  /** Shown under the target notch at the center. */
  targetLabel?: string;
  /** A full sentence describing the reading; it replaces the graphic
      for assistive technology. */
  label: string;
  className?: string;
};

/**
 * Drift against a threshold, on one straight track centered on the
 * target. The tall notch is the target, each short notch a threshold,
 * the knob the reading; the accent bar runs from the target out to the
 * knob. The track always spans at least twice the furthest threshold
 * either side, and widens if the reading goes beyond that, so the knob
 * never runs off the end.
 */
export function DriftGauge({ value, notches = [], targetLabel = "Target", label, className }: DriftGaugeProps) {
  const furthestNotch = notches.reduce((max, notch) => Math.max(max, Math.abs(notch.at)), 0);
  const span = Math.max(furthestNotch * 2, Math.abs(value) * 1.15, Number.EPSILON);
  const toPercent = (at: number) => 50 + (Math.max(-span, Math.min(span, at)) / span) * 50;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("nm-gauge", className)}
      style={{ "--gauge-marker": `${toPercent(value)}%` } as CSSProperties}
    >
      <div className="nm-gauge-track">
        <span className="nm-gauge-fill" />
        {notches.map((notch) => (
          <span key={notch.at} className="nm-gauge-notch" style={{ left: `${toPercent(notch.at)}%` }} />
        ))}
        <span className="nm-gauge-notch" data-kind="target" />
        <span className="nm-gauge-knob" />
      </div>
      <div className="nm-gauge-scale nm-num" aria-hidden="true">
        {notches.map((notch) => (
          <span key={notch.at} style={{ left: `${toPercent(notch.at)}%` }}>
            {notch.label}
          </span>
        ))}
        <span style={{ left: "50%" }}>{targetLabel}</span>
      </div>
    </div>
  );
}
