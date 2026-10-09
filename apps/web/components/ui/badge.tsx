import type { ReactNode } from "react";
import { cn } from "./cn";

type BadgeProps = {
  /** A leading accent dot, for a live or current state. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
};

/** A small pressed pill carrying a short label. Never interactive. */
export function Badge({ dot = false, className, children }: BadgeProps) {
  return (
    <span className={cn("nm-badge", className)}>
      {dot ? <span aria-hidden="true" className="nm-badge-dot" /> : null}
      {children}
    </span>
  );
}

/** The network marker shown beside the wordmark on every page. */
export function TestnetBadge() {
  return <Badge dot>Stellar Testnet</Badge>;
}
