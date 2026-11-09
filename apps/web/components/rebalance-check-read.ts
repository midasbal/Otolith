export type RebalanceCheckResult =
  | { state: "no_policy" }
  | { state: "not_due"; reason: string }
  | { state: "ready"; contextRuleId: number; amountIn: string; amountOut: string }
  | { state: "cooldown" }
  | { state: "pool_blocked" }
  | { state: "error"; message: string };

/** A check as the route answers it: the ledger it was evaluated at, when it reports one. */
export type RebalanceCheckRead = {
  result: RebalanceCheckResult;
  ledger: number | undefined;
};

/**
 * One read of /api/rebalance, straight from the route. The body is the
 * result whatever the HTTP status (the route answers a failed check with an
 * error state in it), so only a request that fails outright throws. The
 * ledger is split off the result so what is cached stays the plain result.
 */
export async function readRebalanceCheck(address: string): Promise<RebalanceCheckRead> {
  const res = await fetch(`/api/rebalance?account=${encodeURIComponent(address)}`);
  const { ledger, ...result } = (await res.json()) as RebalanceCheckResult & { ledger?: unknown };
  return {
    result: result as RebalanceCheckResult,
    ledger: typeof ledger === "number" ? ledger : undefined,
  };
}
