import type { ReactNode } from "react";
import { cn } from "./cn";

type BadgeProps = {
  /** A leading accent dot, for a live or current state. */
  dot?: boolean;
  /** "drift" sets the badge in the drift color, for a portfolio past its band. The label still has to say so. */
  tone?: "drift";
  className?: string;
  children: ReactNode;
};

/** A small pressed pill carrying a short label. Never interactive. */
export function Badge({ dot = false, tone, className, children }: BadgeProps) {
  return (
    <span className={cn("ot-badge", className)} data-tone={tone}>
      {dot ? <span aria-hidden="true" className="ot-badge-dot" /> : null}
      {children}
    </span>
  );
}

/** The network marker shown beside the wordmark on every page. */
export function TestnetBadge() {
  return <Badge dot>Stellar Testnet</Badge>;
}
