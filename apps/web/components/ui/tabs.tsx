"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./icons";

export type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
};

type TabsProps = {
  /** Names the tab list for assistive technology. */
  label: string;
  tabs: TabItem[];
  defaultTab?: string;
  className?: string;
};

/**
 * Tabs, following the ARIA tabs pattern: one tab stop for the whole
 * list, arrow keys (and Home and End) move between tabs and select as
 * they go, and Tab moves on into the panel. The selected tab is raised
 * out of the groove and marked with the accent and a dot.
 */
export function Tabs({ label, tabs, defaultTab, className }: TabsProps) {
  const baseId = useId();
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;

    event.preventDefault();
    const target = tabs[next];
    setActive(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="ot-segmented" onKeyDown={handleKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node);
              else tabRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={tab.id === active}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            className="ot-segment"
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="mt-6 rounded-lg"
        >
          {tab.id === active ? tab.content : null}
        </div>
      ))}
    </div>
  );
}

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
