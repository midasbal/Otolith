import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";

// Geometry in the SVG's 100-unit box. The groove runs from the cap's
// edge (radius 33, the cap being inset 17% in components.css) to the rim
// (radius 50); the arc rides down its middle.
const ARC_RADIUS = 41.5;
const ARC_WIDTH = 8;
const REST_WIDTH = 3;
const TICK_INNER = 34.5;
const TICK_OUTER = 48.5;

// One round line cap, as a percentage of the circle's length. The arc is
// shortened by a cap at each end so its rounded tips land exactly on the
// share, rather than overshooting it by half the stroke.
const CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;
const CAP_PERCENT = (ARC_WIDTH / 2 / CIRCUMFERENCE) * 100;
const REST_CAP_PERCENT = (REST_WIDTH / 2 / CIRCUMFERENCE) * 100;
// Clear ring left between the two arcs, at each end.
const GAP_PERCENT = 1.5;

type AllocationDonutProps = {
  /** The share held now in the tracked asset, from 0 to 1. */
  share: number;
  /** The share targeted for the same asset, from 0 to 1. */
  target?: number;
  /** Also draw the rest of the ring, as a thin arc: the other asset's
      share. It differs from the main arc in weight as well as in color. */
  remainder?: boolean;
  /** A full sentence describing the reading; it replaces the graphic
      for assistive technology, center content included. */
  label: string;
  /** A CSS length for the donut's diameter. */
  size?: string;
  className?: string;
  /** Shown in the center cap. */
  children?: ReactNode;
};

/**
 * Allocation against target, as one ring. The accent arc, drawn from the
 * top clockwise, is the share held now; the dark notch is the target.
 * Where the arc ends short of the notch, or runs past it, is the drift.
 * One color, so the reading never depends on telling two hues apart.
 */
export function AllocationDonut({
  share,
  target,
  remainder = false,
  label,
  size,
  className,
  children,
}: AllocationDonutProps) {
  const held = Math.min(1, Math.max(0, share));
  const arcLength = Math.max(0, held * 100 - 2 * CAP_PERCENT);
  const restStart = held * 100 + GAP_PERCENT + REST_CAP_PERCENT;
  const restLength = Math.max(0, 100 - GAP_PERCENT - REST_CAP_PERCENT - restStart);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("nm-donut", className)}
      style={size ? ({ "--donut-size": size } as CSSProperties) : undefined}
    >
      <div className="nm-donut-groove" />
      <svg viewBox="0 0 100 100" className="nm-donut-svg" aria-hidden="true" focusable="false">
        {remainder && restLength > 0 ? (
          <circle
            cx="50"
            cy="50"
            r={ARC_RADIUS}
            pathLength={100}
            strokeWidth={REST_WIDTH}
            strokeDasharray={`${restLength} ${100 - restLength}`}
            strokeDashoffset={-restStart}
            className="nm-donut-rest"
          />
        ) : null}
        {held > 0 ? (
          <circle
            cx="50"
            cy="50"
            r={ARC_RADIUS}
            pathLength={100}
            strokeWidth={ARC_WIDTH}
            strokeDasharray={`${arcLength} ${100 - arcLength}`}
            strokeDashoffset={-CAP_PERCENT}
            className="nm-donut-arc"
          />
        ) : null}
        {target !== undefined ? (
          <line
            x1={50 + TICK_INNER}
            y1="50"
            x2={50 + TICK_OUTER}
            y2="50"
            strokeWidth={2.5}
            transform={`rotate(${Math.min(1, Math.max(0, target)) * 360} 50 50)`}
            className="nm-donut-tick"
          />
        ) : null}
      </svg>
      <div className="nm-donut-cap">{children}</div>
    </div>
  );
}
