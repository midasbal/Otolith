"use client";

import { cn } from "./cn";
import { Icon } from "./icons";

export type StepItem = {
  id: string;
  label: string;
};

type StepperProps = {
  /** Names the list for assistive technology. */
  label: string;
  steps: StepItem[];
  current: string;
  className?: string;
};

/**
 * A step indicator for a linear flow. It shows where you are; it is not
 * a control, since the flow's own Back and Continue decide when a step
 * may change. The current step is marked with aria-current="step", the
 * accent, and a dot. A step already passed shows a check where its
 * number was (the number stays in the text assistive technology reads),
 * so the row is the same width at every step and fits a narrow screen.
 */
export function Stepper({ label, steps, current, className }: StepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === current);

  return (
    <ol aria-label={label} className={cn("ot-segmented", className)}>
      {steps.map((step, index) => {
        const done = index < currentIndex;
        return (
          <li
            key={step.id}
            aria-current={step.id === current ? "step" : undefined}
            data-state={done ? "done" : undefined}
            className="ot-segment"
          >
            {done ? <Icon name="check" size={14} className="flex-none" /> : null}
            <span>
              <span className={done ? "sr-only" : "ot-num"}>{index + 1}.</span> {step.label}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
