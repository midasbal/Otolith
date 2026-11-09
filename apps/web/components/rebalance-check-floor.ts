import type { QueryClient } from "@tanstack/react-query";
import { raiseAccountFloor, readAtFloor, reconcileAtFloor } from "@/components/account-ledger-floor";
import { queryKeys } from "@/components/query-keys";
import { readRebalanceCheck, type RebalanceCheckResult } from "@/components/rebalance-check-read";

/*
  The rebalance check behind the account's ledger floor (see
  account-ledger-floor.ts for what the floor is and why).

  The route reports the ledger a check was evaluated at: the lowest of the
  policy read and the rebalance simulation it ran. A check below the floor
  of the last confirmed transaction is stale (most visibly a "no policy"
  read from a node that has not yet seen an install, which would hide the
  dashboard's rebalance section), so it is held back, and the three
  transactions that can change the answer treat the cached check as
  follows:

    install    the check cannot be built from what was installed, so the
               cached one is dropped and the screen shows the check's own
               loading state until a read at or above the floor arrives;
    revoke     "no policy" is known, so it is written now behind the floor;
    rebalance  the check is read again against the floor the rebalance
               raised, keeping the old one on screen meanwhile.
*/

/** Reads the check for the cache, held to the account's floor (see readAtFloor). */
export async function fetchRebalanceCheckGuarded(
  queryClient: QueryClient,
  address: string,
  attempts?: number,
): Promise<RebalanceCheckResult> {
  return readAtFloor({
    queryClient,
    address,
    reader: "rebalanceCheck",
    attempts,
    // With no check cached there is nothing to fall back to, and a stale one
    // stored as the first answer is the very thing the floor is for: fail,
    // and the query tries again.
    whenEmpty: "fail",
    read: async () => {
      const read = await readRebalanceCheck(address);
      return { value: read.result, ledger: read.ledger };
    },
    cached: () => queryClient.getQueryData<RebalanceCheckResult>(queryKeys.rebalanceCheck(address)),
  });
}

function reconcileCheck(queryClient: QueryClient, address: string): void {
  void reconcileAtFloor(queryClient, address, "rebalanceCheck", queryKeys.rebalanceCheck(address), () =>
    fetchRebalanceCheckGuarded(queryClient, address, 1),
  );
}

/**
 * A confirmed install: raises the floor and drops the cached check, so no
 * earlier answer (a "no policy" above all) can be shown. A screen that is
 * showing the check reads it again at once; otherwise it is read when a
 * screen asks, and in the background until a reading meets the floor.
 */
export async function dropConfirmedCheck(queryClient: QueryClient, address: string, ledger: number): Promise<void> {
  raiseAccountFloor(queryClient, address, ledger);
  const queryKey = queryKeys.rebalanceCheck(address);
  await queryClient.cancelQueries({ queryKey });
  await queryClient.resetQueries({ queryKey });
  reconcileCheck(queryClient, address);
}

/** A confirmed revoke: writes "no policy" now, behind the floor, and reads until the chain agrees. */
export async function applyConfirmedNoPolicyCheck(queryClient: QueryClient, address: string, ledger: number): Promise<void> {
  raiseAccountFloor(queryClient, address, ledger);
  const queryKey = queryKeys.rebalanceCheck(address);
  await queryClient.cancelQueries({ queryKey });
  queryClient.setQueryData<RebalanceCheckResult>(queryKey, { state: "no_policy" });
  reconcileCheck(queryClient, address);
}

/**
 * A confirmed rebalance: raises the floor to its ledger and reads the check
 * again until a reading meets it. The check on screen stays until then.
 */
export async function refreshCheckAfterRebalance(queryClient: QueryClient, address: string, ledger: number): Promise<void> {
  raiseAccountFloor(queryClient, address, ledger);
  await queryClient.cancelQueries({ queryKey: queryKeys.rebalanceCheck(address) });
  reconcileCheck(queryClient, address);
}
