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
  /** Thresholds to mark on the track, such as the edge of the band: at
      most one either side of the target. The stretch between a threshold
      and the target is shaded. */
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
 * knob, and the stretch from a threshold to the target (the band) is
 * shaded. The track always spans at least twice the furthest threshold
 * either side, and widens if the reading goes beyond that, so the knob
 * never runs off the end.
 *
 * A wide reading squeezes the band toward the target. Two things are
 * held open however far that goes, both in the stylesheet: the band
 * keeps a least width, so it can always be seen, and a threshold's label
 * keeps a gap from the target's label and never passes the end of the
 * track, so no label is ever drawn over another or cut off. The labels
 * are set in the monospaced face, which is what lets the stylesheet know
 * how wide each one is: its length in characters is all it needs.
 */
export function DriftGauge({ value, notches = [], targetLabel = "Target", label, className }: DriftGaugeProps) {
  const furthestNotch = notches.reduce((max, notch) => Math.max(max, Math.abs(notch.at)), 0);
  const span = Math.max(furthestNotch * 2, Math.abs(value) * 1.15, Number.EPSILON);
  const toPercent = (at: number) => 50 + (Math.max(-span, Math.min(span, at)) / span) * 50;
  const placed = notches.map((notch) => ({
    ...notch,
    side: notch.at < 0 ? "low" : "high",
    style: { "--gauge-at": `${toPercent(notch.at)}%`, "--gauge-chars": notch.label.length } as CSSProperties,
  }));

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("ot-gauge", className)}
      style={{ "--gauge-marker": `${toPercent(value)}%`, "--gauge-target-chars": targetLabel.length } as CSSProperties}
    >
      <div className="ot-gauge-track">
        <span className="ot-gauge-fill" />
        {/* The band is laid over the bar, so it shows whether or not the bar has reached it. */}
        {placed.map((notch) => (
          <span key={notch.at} className="ot-gauge-band" data-side={notch.side} style={notch.style} />
        ))}
        {placed.map((notch) => (
          <span key={notch.at} className="ot-gauge-notch" data-side={notch.side} style={notch.style} />
        ))}
        <span className="ot-gauge-notch" data-kind="target" />
        <span className="ot-gauge-knob" />
      </div>
      <div className="ot-gauge-scale ot-num" aria-hidden="true">
        {placed.map((notch) => (
          <span key={notch.at} data-side={notch.side} style={notch.style}>
            {notch.label}
          </span>
        ))}
        <span data-kind="target">{targetLabel}</span>
      </div>
    </div>
  );
}
