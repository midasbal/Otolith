"use client";

import type { CSSProperties } from "react";
import { cn } from "./cn";
import { Icon } from "./icons";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export type ProgressStage<Id extends string = string> = {
  id: Id;
  label: string;
};

type OperationProgressProps<Id extends string> = {
  /** What is running, for assistive technology: "Creating your account". */
  label: string;
  /** The stages in the order they happen. */
  stages: ProgressStage<Id>[];
  /** The stage the operation is in now. Earlier ones read as done. */
  current: Id;
  /** A quiet line under the list, for a wait whose later stages are not observable. */
  note?: string;
  className?: string;
};

/**
 * The display for an on-chain operation that takes a while. A short
 * list of stages, the current one marked, with a bubble on a line that
 * settles at each stage the way the level does, and drifts a little
 * while it waits so the wait reads as alive. The line, the marks and
 * the bubble are the level's own parts (see level.tsx and landing.css),
 * with the marks at the stages instead of the band.
 *
 * It only ever says what the caller knows: `current` should move on a
 * real signal, and the note is for the stretch where there is none.
 * Under prefers-reduced-motion nothing moves: the bubble stands at the
 * current stage and the list says the rest.
 */
export function OperationProgress<Id extends string>({
  label,
  stages,
  current,
  note,
  className,
}: OperationProgressProps<Id>) {
  const reducedMotion = usePrefersReducedMotion();
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === current),
  );
  const place = (index: number) => (index + 0.5) / stages.length;

  return (
    <div
      data-motion={reducedMotion ? "still" : undefined}
      className={cn("ot-progress", className)}
      style={{ "--progress-at": place(currentIndex) } as CSSProperties}
    >
      {/* One short sentence is announced per change, not the whole list. */}
      <p role="status" className="sr-only">
        {label}: step {currentIndex + 1} of {stages.length}, {stages[currentIndex].label}.
      </p>

      <div aria-hidden="true" className="ot-progress-track">
        <span className="ot-level-line" />
        {stages.map((stage, index) => (
          <span
            key={stage.id}
            className="ot-progress-mark"
            data-state={index <= currentIndex ? "reached" : undefined}
            style={{ left: `${place(index) * 100}%` }}
          />
        ))}
        <span className="ot-progress-travel">
          <span className="ot-progress-drift">
            <span className="ot-level-bubble" />
          </span>
        </span>
      </div>

      <ol aria-label={label} className="ot-progress-list">
        {stages.map((stage, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
          return (
            <li key={stage.id} data-state={state} aria-current={state === "active" ? "step" : undefined} className="ot-progress-step">
              <span aria-hidden="true" className="ot-progress-dot">
                {state === "done" ? <Icon name="check" size={12} /> : null}
              </span>
              <span>
                {stage.label}
                {state === "done" ? <span className="sr-only"> (done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {note ? <p className="text-xs text-text-muted">{note}</p> : null}
    </div>
  );
}
