import type { CSSProperties } from "react";
import { cn } from "./cn";

type LevelProps = {
  /** How far the portfolio has drifted from its target, in percent. Signed. */
  drift: number;
  /** The allowed drift either side of the target, in percent. */
  band: number;
  /** Where the bubble starts before it settles on `drift`, for an entrance. */
  from?: number;
  /** A sentence describing the reading. Leave it out where the same thing is said in text beside it. */
  label?: string;
  className?: string;
};

/**
 * A level: a bubble on a line, and two marks it should sit between. The
 * marks are the band; the bubble is the drift. Between the marks, the
 * portfolio is in balance; outside them, a rebalance is due, and the
 * bubble takes the drift color as well as leaving the marks, so the
 * reading never rests on color alone.
 *
 * The line spans twice the band either side, and the bubble stops at its
 * ends.
 */
export function Level({ drift, band, from, label, className }: LevelProps) {
  const place = (value: number) => Math.min(1, Math.max(0, 0.5 + value / (band * 4)));
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-out={Math.abs(drift) > band ? "true" : undefined}
      data-entrance={from !== undefined ? "true" : undefined}
      className={cn("ot-level", className)}
      style={{ "--level-at": place(drift), "--level-from": place(from ?? drift) } as CSSProperties}
    >
      <span className="ot-level-line" />
      <span className="ot-level-mark" data-side="low" />
      <span className="ot-level-mark" data-side="high" />
      <span className="ot-level-travel">
        <span className="ot-level-bubble" />
      </span>
    </div>
  );
}
