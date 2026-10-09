import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A list of label and value pairs (policy terms, transaction details),
 * as a real description list. Rows are separated by the groove.
 */
export function DataList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cn("nm-datalist", className)}>{children}</dl>;
}

type DataRowProps = {
  label: ReactNode;
  /** Set the value in tabular, monospaced figures. On by default, since
      nearly every value here is a number, an address, or a hash. */
  numeric?: boolean;
  children: ReactNode;
};

export function DataRow({ label, numeric = true, children }: DataRowProps) {
  return (
    <div className="nm-datarow">
      <dt>{label}</dt>
      <dd className={numeric ? "nm-num" : undefined}>{children}</dd>
    </div>
  );
}
