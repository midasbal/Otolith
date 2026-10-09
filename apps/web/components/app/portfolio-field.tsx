"use client";

import { useEffect, useRef } from "react";
import { useBackground } from "@/components/background/background";
import type { RebalanceState, TriggerState } from "./types";

/**
 * Whether the rebalance check found this portfolio past its band on the
 * side the contract trades on, so that a rebalance is called for. That
 * is the check saying so outright ("ready"), or naming the one thing
 * holding a called-for rebalance back: the cooldown, the pool's
 * liquidity, or its cost.
 *
 * Holding more of the buy asset than the target is never this, however
 * far past the band it is: the contract only ever sells the sell asset
 * for the buy asset (contracts/rebalancer), so the check reports it as
 * not due, the same as being within the band.
 */
export function rebalanceDue(rebalanceState: RebalanceState): boolean {
  if (rebalanceState.status !== "loaded") return false;
  const { result } = rebalanceState;
  return (
    result.state === "ready" ||
    result.state === "cooldown" ||
    result.state === "pool_blocked" ||
    (result.state === "not_due" && result.reason === "CostExceedsBenefit")
  );
}

/*
  Tells the background what the portfolio is doing. It renders nothing.

  It only reads what the dashboard already has: the result of the
  rebalance check the page reports in words, and the state of a
  rebalance the page was asked to submit. While a rebalance is called
  for, the field drifts; otherwise (within the band, above target,
  loading, an error, no policy) it is calm. A submitted rebalance sends
  one pulse through it, and that is all the pulse does: the field goes
  on showing whatever the check says, so a rebalance that was submitted
  but left the portfolio past its band, or one that failed, never looks
  like balance.

  The background is never the only place this is shown: the dashboard's
  badge and drift figure, its rebalance panel, and its "Rebalance
  submitted" panel say the same things in text.
*/
export function PortfolioField({ rebalanceState, triggerState }: { rebalanceState: RebalanceState; triggerState: TriggerState }) {
  const background = useBackground();
  const due = rebalanceDue(rebalanceState);

  useEffect(() => {
    background.setState(due ? "drifting" : "balanced");
  }, [background, due]);

  // Leaving the dashboard leaves the field calm.
  useEffect(() => () => background.setState("balanced"), [background]);

  // One pulse per submitted rebalance, keyed on its transaction: the same
  // transaction never pulses twice, however often this effect runs.
  const submitted = triggerState.status === "success" ? triggerState.hash : null;
  const pulsed = useRef<string | null>(null);
  useEffect(() => {
    if (!submitted || pulsed.current === submitted) return;
    pulsed.current = submitted;
    background.pulse();
  }, [background, submitted]);

  return null;
}
