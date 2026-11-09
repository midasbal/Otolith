import type { QueryClient } from "@tanstack/react-query";
import { raiseAccountFloor, readAtFloor, reconcileAtFloor } from "@/components/account-ledger-floor";
import { queryKeys } from "@/components/query-keys";
import { readSmartAccountBalances, type ExtraTokenContract, type SmartAccountBalancesResult } from "@/lib/stellar";
import { BUY_ASSET } from "@/lib/stellar/policy-config";

/*
  The account's balances behind its ledger floor (see
  account-ledger-floor.ts for what the floor is and why).

  Only a rebalance moves funds, so it is the one transaction whose
  confirmation makes the balances on screen out of date. It raises the
  floor to its ledger, the balances on screen stay, and a reading below
  that ledger is held back (a read from a node that has not seen the
  rebalance would otherwise put the old amounts back) until one at or
  above it replaces them. The valuation is arithmetic over the cached
  balances and prices (use-portfolio-value.ts), so it follows the balances
  with no floor of its own; the prices are market data, not tied to a
  transaction.

  An install or revoke moves no funds. A balances reading after one is
  evaluated at or above its ledger like any other, so it passes the floor
  at once; one that does lag is held to what is cached, which that
  transaction did not change.
*/

// The tokens this product holds are fixed: the XLM/USDC pair (see
// policy-config.ts), with native XLM always read first by the read
// layer. So the list is a constant, not something derived from the
// policy once it loads: a list that changed when the policy arrived
// would change the query's key, and the balances would be read twice.
const PAIR_TOKENS: ExtraTokenContract[] = [{ contract: BUY_ASSET.contract, code: BUY_ASSET.symbol }];

/** Reads the pair's balances for the cache, held to the account's floor (see readAtFloor). */
export async function fetchBalancesGuarded(
  queryClient: QueryClient,
  address: string,
  attempts?: number,
): Promise<SmartAccountBalancesResult> {
  return readAtFloor({
    queryClient,
    address,
    reader: "balances",
    attempts,
    // Nothing cached and every attempt behind: balances an earlier
    // transaction left alone are still right, so the latest reading is shown
    // rather than hold the screen on loading.
    whenEmpty: "latest",
    read: async () => {
      const read = await readSmartAccountBalances(address, PAIR_TOKENS);
      return { value: read.result, ledger: read.ledger };
    },
    cached: () => queryClient.getQueryData<SmartAccountBalancesResult>(queryKeys.balances(address)),
  });
}

/**
 * A confirmed rebalance: raises the floor to its ledger and reads the
 * balances again until a reading meets it. The balances on screen stay
 * until then.
 */
export async function refreshBalancesAfterRebalance(queryClient: QueryClient, address: string, ledger: number): Promise<void> {
  raiseAccountFloor(queryClient, address, ledger);
  await queryClient.cancelQueries({ queryKey: queryKeys.balances(address) });
  void reconcileAtFloor(queryClient, address, "balances", queryKeys.balances(address), () =>
    fetchBalancesGuarded(queryClient, address, 1),
  );
}
