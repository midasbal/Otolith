import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/states";

/*
  The small set of pieces the docs are written with, so the two guides read
  the same way and the page's own styling lives in one place. All of it is
  plain markup on the app's existing surfaces and type: nothing here needs a
  script, and the content files import these instead of writing classes.
*/

export type DocSection = {
  id: string;
  title: string;
  body: ReactNode;
};

/** A paragraph. */
export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-2xl text-base leading-relaxed text-text-muted", className)}>{children}</p>;
}

/** A heading inside a section. */
export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 font-display text-base font-medium text-text">{children}</h3>;
}

/** An identifier, a parameter name or a function: set in the monospaced face. */
export function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.875em] text-text [overflow-wrap:anywhere]">{children}</code>;
}

/** A bulleted list. */
export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="flex max-w-2xl list-disc flex-col gap-2 pl-5 text-base leading-relaxed text-text-muted marker:text-accent">
      {children}
    </ul>
  );
}

/** An ordered run of steps: a number in the monospaced face, then what happens. */
export function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol className="flex max-w-2xl flex-col">
      {children.map((step, index) => (
        <li
          key={index}
          className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-3 text-base leading-relaxed text-text-muted [box-shadow:var(--groove)] first:[box-shadow:none]"
        >
          <span className="ot-num pt-0.5 text-sm text-accent">{String(index + 1).padStart(2, "0")}</span>
          <div className="min-w-0">{step}</div>
        </li>
      ))}
    </ol>
  );
}

type TableProps = {
  head: string[];
  rows: ReactNode[][];
  /** Which columns hold figures, set in the monospaced face and right aligned. */
  numeric?: number[];
  caption: string;
};

/** A reference table. It scrolls inside its own box rather than push the page wider. */
export function Table({ head, rows, numeric = [], caption }: TableProps) {
  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
      <table className="ot-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((label, column) => (
              <th key={label} scope="col" data-numeric={numeric.includes(column) ? "" : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="align-top">
              {row.map((cell, column) => (
                <td
                  key={column}
                  data-numeric={numeric.includes(column) ? "" : undefined}
                  className={cn("text-text-muted", column === 0 && "text-text [overflow-wrap:anywhere]")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A note set apart from the text around it. */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Notice title={title} className="max-w-2xl">
      {children}
    </Notice>
  );
}

/** One reading: a label over a value, in a small pressed well like an instrument's. */
export function Readout({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="pressed" depth="sm" className="flex flex-col gap-1 p-4!">
      <span className="ot-caps">{label}</span>
      <span className="ot-num text-base text-text">{value}</span>
    </Card>
  );
}

/** A contract or asset address, with a link to it on the explorer. */
export function Address({ value }: { value: string }) {
  return (
    <a
      href={`https://stellar.expert/explorer/testnet/contract/${value}`}
      target="_blank"
      rel="noreferrer"
      className="ot-link ot-hit font-mono text-xs [overflow-wrap:anywhere]"
    >
      {value}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

type FaqItem = { question: string; answer: ReactNode };

/** Questions that open in place. Native details elements, so they work without a script and from the keyboard. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {items.map((item) => (
        <details key={item.question} className="group ot-raised-sm rounded-xl">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-xl px-5 py-4 font-medium text-text [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">{item.question}</span>
            <Icon
              name="chevron-down"
              size={18}
              className="mt-1 flex-none text-text-muted transition-transform duration-150 group-open:rotate-180"
            />
          </summary>
          <div className="flex flex-col gap-3 px-5 pb-5 text-base leading-relaxed text-text-muted">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
