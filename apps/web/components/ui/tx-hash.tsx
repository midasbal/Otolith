import { cn } from "./cn";

/**
 * A transaction hash or account address, in full, set into a pressed
 * well. Monospaced, and allowed to break anywhere so the whole value is
 * always visible and selectable rather than truncated.
 */
export function TxHash({ value, className }: { value: string; className?: string }) {
  return (
    <div className={cn("ot-hash", className)}>
      <span className="ot-hash-value">{value}</span>
    </div>
  );
}
