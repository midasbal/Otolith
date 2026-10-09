"use client";

import { useState } from "react";
import { useBackground } from "@/components/background/background";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { Level } from "@/components/ui/level";

/*
  The drift simulator: the product's one move, by hand. "Let it drift"
  carries the example portfolio past its band; "Rebalance" brings it
  back. Both act on the page's background as well, which is the same
  field showing the same thing: the rings buckle and warm while it
  drifts, and a rebalance sends one ring out through them.

  It is an example and says so. The figures are fixed and local to this
  file; nothing is read from a wallet, a contract, or the network.
*/

const BAND_PERCENT = 2;
const RESTING_DRIFT = 0.2;
const DRIFTED = 3.8;

type Phase = "balanced" | "drifting" | "rebalanced";

const STATUS: Record<Phase, { drift: number; text: string }> = {
  balanced: { drift: RESTING_DRIFT, text: "Within band" },
  drifting: { drift: DRIFTED, text: "Past band: a rebalance is due" },
  rebalanced: { drift: RESTING_DRIFT, text: "Rebalanced: back within band" },
};

export function DriftDemo() {
  const background = useBackground();
  const [phase, setPhase] = useState<Phase>("balanced");
  const status = STATUS[phase];
  const past = phase === "drifting";

  return (
    <Card className="ot-demo" data-phase={phase}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge>Example</Badge>
        <p className="ot-caps">Drift simulator</p>
      </div>

      <Level drift={status.drift} band={BAND_PERCENT} className="ot-demo-level" />

      {/* One line, announced when it changes: the drift, and what it means. */}
      <p role="status" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="ot-num text-lg text-text">{status.drift.toFixed(2)}%</span>
        <span className={past ? "ot-demo-past text-sm" : "text-sm text-text-muted"}>
          {past ? <Icon name="alert" size={14} className="mr-1.5 inline-block align-[-2px]" /> : null}
          {status.text}
        </span>
      </p>

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={past}
          onClick={() => {
            setPhase("drifting");
            background.setState("drifting");
          }}
        >
          Let it drift
        </Button>
        <Button
          variant="primary"
          disabled={!past}
          onClick={() => {
            setPhase("rebalanced");
            background.setState("balanced");
            background.pulse();
          }}
        >
          Rebalance
        </Button>
      </div>
    </Card>
  );
}
