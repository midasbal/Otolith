import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/components/query-keys";
import { readPolicyStatus, type PolicyStatus } from "@/lib/stellar";

/*
  Keeping a confirmed install or revoke from being undone by a stale read.

  Every RPC answer says which ledger it was evaluated at, and an answer at
  ledger N includes every transaction up to and including ledger N. When
  an install or revoke is confirmed in ledger L, any policy reading
  evaluated before L is out of date by definition, however it came about:
  a node that is a ledger behind, or a read that began before the
  transaction and landed after it. Left to the cache, such a reading would
  be written as the truth (the last one to finish wins) and stay there
  until the next read.

  So the confirmed ledger is kept as a floor for the account, and the one
  function that reads the policy for the cache (fetchPolicyGuarded) will
  not hand back a reading below it. Everything that reads the policy goes
  through that function: a page opening, the retry button, a reconnect,
  and the reconcile below.

  On confirmation the known outcome is written straight into the cache, so
  the screen is right at once, and a short background loop reads until the
  chain's own answer is at or above the floor, which then replaces it.
*/

export const FLOOR_LOG_TAG = "policy-floor";

type Floor = {
  /** The ledger the confirmed transaction was included in. */
  ledger: number;
  /** When the floor was raised, for the window below. */
  raisedAt: number;
  /** Whether a reading at or above the floor has been stored. */
  met: boolean;
};

// Reads a guarded fetch makes before it gives up on getting past the
// floor, with a pause of this long times the attempt number between them.
const GUARD_ATTEMPTS = 3;
const GUARD_RETRY_DELAY_MS = 750;

// How long after it is raised a floor holds. Past this, whatever is read
// is accepted, so an RPC that stays behind can never freeze the screen on
// a provisional value. A normal lag is a few seconds; a minute is far
// beyond it and still short enough to be harmless.
export const FLOOR_WINDOW_MS = 60_000;

// The background reconcile: a read every second or so, for at most this
// long. Each read takes a couple of seconds itself, so this is about a
// dozen attempts at most, and it stops as soon as the floor is met.
const RECONCILE_INTERVAL_MS = 1_000;
const RECONCILE_WINDOW_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The floor in force for the account, or null if there is none or it has lapsed. */
function activeFloor(queryClient: QueryClient, address: string): Floor | null {
  const floor = queryClient.getQueryData<Floor>(queryKeys.policyFloor(address));
  if (!floor || Date.now() - floor.raisedAt > FLOOR_WINDOW_MS) {
    return null;
  }
  return floor;
}

/**
 * Raises the account's floor to the ledger a confirmed transaction was
 * included in. A floor only ever goes up: confirming an older ledger than
 * the one already held changes nothing.
 */
export function raisePolicyFloor(queryClient: QueryClient, address: string, ledger: number): void {
  const current = activeFloor(queryClient, address);
  if (current && current.ledger >= ledger) {
    return;
  }
  const floor: Floor = { ledger, raisedAt: Date.now(), met: false };
  queryClient.setQueryData(queryKeys.policyFloor(address), floor);
}

function markFloorMet(queryClient: QueryClient, address: string, floor: Floor): void {
  queryClient.setQueryData(queryKeys.policyFloor(address), { ...floor, met: true });
}

function logDiscard(address: string, readLedger: number, floor: Floor, attempt: number): void {
  console.log(
    JSON.stringify({
      tag: FLOOR_LOG_TAG,
      event: "discarded-stale-read",
      account: address,
      readLedger,
      floorLedger: floor.ledger,
      behindBy: floor.ledger - readLedger,
      attempt,
      floorAgeMs: Date.now() - floor.raisedAt,
    }),
  );
}

/**
 * Reads the policy for the cache. A reading evaluated below the account's
 * floor is stale, so it is not returned: the read is tried again (up to
 * `attempts` times, a short pause apart) and, if every attempt is still
 * below the floor, what the cache already holds is returned in its place,
 * which leaves the cache as it was. With no floor, or one that has lapsed,
 * this is a plain read.
 */
export async function fetchPolicyGuarded(
  queryClient: QueryClient,
  address: string,
  attempts: number = GUARD_ATTEMPTS,
): Promise<PolicyStatus> {
  let latest: PolicyStatus | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const read = await readPolicyStatus(address);
    latest = read.status;

    // The floor is looked up after the read returns, not before it starts:
    // a read that began before a transaction confirmed must be held to the
    // floor that transaction raised.
    const floor = activeFloor(queryClient, address);
    if (!floor) {
      return read.status;
    }
    if (read.ledger >= floor.ledger) {
      markFloorMet(queryClient, address, floor);
      return read.status;
    }

    logDiscard(address, read.ledger, floor, attempt);
    if (attempt < attempts) {
      await sleep(GUARD_RETRY_DELAY_MS * attempt);
    }
  }
  // Nothing at or above the floor. Keep what is cached; with nothing cached
  // there is nothing to protect, so the latest reading is all there is.
  return queryClient.getQueryData<PolicyStatus>(queryKeys.policy(address)) ?? (latest as PolicyStatus);
}

const reconciling = new Set<string>();

/**
 * Reads the policy, in the background, until a reading at or above the
 * account's floor has been stored, so the provisional value is replaced by
 * the chain's own. Bounded, never throws, and not meant to be awaited.
 */
async function reconcilePolicy(queryClient: QueryClient, address: string): Promise<void> {
  if (reconciling.has(address)) {
    return;
  }
  reconciling.add(address);
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < RECONCILE_WINDOW_MS) {
      await sleep(RECONCILE_INTERVAL_MS);
      const floor = activeFloor(queryClient, address);
      if (!floor || floor.met) {
        return;
      }
      try {
        await queryClient.fetchQuery({
          queryKey: queryKeys.policy(address),
          staleTime: 0,
          retry: false,
          queryFn: () => fetchPolicyGuarded(queryClient, address, 1),
        });
      } catch {
        // A read that failed outright: the next turn of the loop tries again.
      }
    }
  } finally {
    reconciling.delete(address);
  }
}

/**
 * Applies a confirmed install or revoke: raises the floor to its ledger,
 * writes the known outcome into the policy cache so the screen is right at
 * once, and starts the background reconcile. Resolves as soon as the cache
 * is written; the reconcile is not waited for.
 *
 * The floor goes up before anything else, so a read already in flight
 * from before the transaction is held to it when it lands, and any such
 * fetch is cancelled before the outcome is written over it.
 */
export async function applyConfirmedPolicy(
  queryClient: QueryClient,
  address: string,
  ledger: number,
  outcome: PolicyStatus,
): Promise<void> {
  raisePolicyFloor(queryClient, address, ledger);
  await queryClient.cancelQueries({ queryKey: queryKeys.policy(address) });
  queryClient.setQueryData(queryKeys.policy(address), outcome);
  void reconcilePolicy(queryClient, address);
}
