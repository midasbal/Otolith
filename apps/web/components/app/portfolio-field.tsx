"use client";

import { useEffect, useRef } from "react";
import { useBackground } from "@/components/background/background";
import type { RebalanceState, TriggerState, ValuationState } from "./types";

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

/**
 * What the portfolio holds of the asset it sells, as a share of what its
 * target says it should hold: 1 on target, more when it holds too much
 * of it (the side a rebalance trades from), less when it holds more of
 * the buy asset than the target. Null until the portfolio is valued.
 * Read from the same valuation the dashboard prints.
 */
export function portfolioLevel(valuationState: ValuationState): number | null {
  if (valuationState.status !== "loaded" || valuationState.result.kind !== "valued") return null;
  const { currentBuyWeightBps, targetBuyWeightBps } = valuationState.result;
  const target = 10000 - targetBuyWeightBps;
  if (target <= 0) return null;
  return (10000 - currentBuyWeightBps) / target;
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
export function PortfolioField({
  rebalanceState,
  triggerState,
  valuationState,
}: {
  rebalanceState: RebalanceState;
  triggerState: TriggerState;
  valuationState: ValuationState;
}) {
  const background = useBackground();
  const due = rebalanceDue(rebalanceState);
  const level = portfolioLevel(valuationState);

  // How full the scene's two vessels are: the valuation the page shows in figures, and nothing else.
  useEffect(() => {
    background.setLevel(level);
  }, [background, level]);
  useEffect(() => () => background.setLevel(null), [background]);

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
