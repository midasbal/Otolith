"use client";

import { useEffect, useState } from "react";
import { FundInLiraView } from "@/components/app/fund-in-lira-view";
import { useDepositTry } from "@/components/use-deposit-try";

function useEstimatedUsdc(tryAmount: string): { estimate: string | null; loading: boolean } {
  const [estimate, setEstimate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const numeric = Number(tryAmount);
    const isValidAmount = Boolean(tryAmount) && Number.isFinite(numeric) && numeric > 0;

    const timeout = setTimeout(() => {
      if (cancelled) {
        return;
      }
      if (!isValidAmount) {
        setEstimate(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      fetch(`/api/deposit-try?amount=${encodeURIComponent(tryAmount)}`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) {
            setEstimate(typeof data.estimatedUsdc === "string" ? data.estimatedUsdc : null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setEstimate(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [tryAmount]);

  return { estimate, loading };
}

/**
 * "Fund your portfolio in lira": a real SEP-6 on-ramp against the TR mock
 * anchor (tr-mock-anchor.fly.dev), driven entirely by the server's own
 * relay key (see lib/server/anchor.ts). Every label here is deliberately
 * honest about what is real (the SEP flow, the testnet USDC, the on-chain
 * transactions) and what is simulated (the bank leg, KYC) — this is a
 * sandbox anchor, not a real bank.
 */
export function FundInLira({ account, onDeposited }: { account: string; onDeposited: () => void }) {
  const [amountTry, setAmountTry] = useState("500");
  const { estimate, loading: estimating } = useEstimatedUsdc(amountTry);
  const { state, deposit, reset } = useDepositTry();

  const handleSubmit = async () => {
    const succeeded = await deposit(account, amountTry);
    if (succeeded) {
      onDeposited();
    }
  };

  return (
    <FundInLiraView
      state={state}
      amountTry={amountTry}
      estimate={estimate}
      estimating={estimating}
      onAmountChange={(e) => setAmountTry(e.target.value.replace(/[^0-9.]/g, ""))}
      onSubmit={() => void handleSubmit()}
      onReset={reset}
    />
  );
}
