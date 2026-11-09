import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/components/query-keys";
import { readPolicyStatus, type PolicyStatus } from "@/lib/stellar";

/*
  Keeping a confirmed transaction from being undone by a stale read.

  Every RPC answer says which ledger it was evaluated at, and an answer at
  ledger N includes every transaction up to and including ledger N. When
  an install or revoke is confirmed in ledger L, any policy reading
  evaluated before L is out of date by definition, however it came about:
  a node that is a ledger behind, or a read that began before the
  transaction and landed after it. Left to the cache, such a reading would
  be written as the truth (the last one to finish wins) and stay there
  until the next read.

  So the confirmed ledger is kept as one floor for the account, shared by
  every reading that depends on the account's state. Each such reading
  goes through readAtFloor, which will not hand back an answer below the
  floor: the policy through fetchPolicyGuarded here, the rebalance check
  through fetchRebalanceCheckGuarded (rebalance-check-floor.ts), the
  balances through fetchBalancesGuarded (balances-floor.ts). That
  covers a page opening, the retry button, a reconnect, and the reconcile
  below.

  On confirmation the known outcome is written straight into the cache
  where there is one, so the screen is right at once, and a short
  background loop reads until the chain's own answer is at or above the
  floor, which then replaces it. Each reading tracks for itself whether it
  has met the floor, so one meeting it does not end the other's loop.
*/

export const FLOOR_LOG_TAG = "account-floor";

/** The readings held to the floor. */
export type FloorReader = "policy" | "rebalanceCheck" | "balances";

type Floor = {
  /** The ledger the confirmed transaction was included in. */
  ledger: number;
  /** When the floor was raised, for the window below. */
  raisedAt: number;
  /** For each reading, whether one at or above the floor has been stored. */
  met: Partial<Record<FloorReader, boolean>>;
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
  const floor = queryClient.getQueryData<Floor>(queryKeys.accountFloor(address));
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
export function raiseAccountFloor(queryClient: QueryClient, address: string, ledger: number): void {
  const current = activeFloor(queryClient, address);
  if (current && current.ledger >= ledger) {
    return;
  }
  const floor: Floor = { ledger, raisedAt: Date.now(), met: {} };
  queryClient.setQueryData(queryKeys.accountFloor(address), floor);
}

function markFloorMet(queryClient: QueryClient, address: string, floor: Floor, reader: FloorReader): void {
  // Read back rather than spread from `floor`: the floor may have been
  // raised since it was looked up, and that newer one must not be undone.
  const current = queryClient.getQueryData<Floor>(queryKeys.accountFloor(address));
  if (!current || current.raisedAt !== floor.raisedAt) {
    return;
  }
  queryClient.setQueryData(queryKeys.accountFloor(address), { ...current, met: { ...current.met, [reader]: true } });
}

function logDiscard(address: string, reader: FloorReader, readLedger: number, floor: Floor, attempt: number): void {
  console.log(
    JSON.stringify({
      tag: FLOOR_LOG_TAG,
      event: "discarded-stale-read",
      reader,
      account: address,
      readLedger,
      floorLedger: floor.ledger,
      behindBy: floor.ledger - readLedger,
      attempt,
      floorAgeMs: Date.now() - floor.raisedAt,
    }),
  );
}

type FloorRead<T> = {
  value: T;
  /** The ledger the reading was evaluated at; undefined if it did not say. */
  ledger: number | undefined;
};

type ReadAtFloorOptions<T> = {
  queryClient: QueryClient;
  address: string;
  reader: FloorReader;
  read: () => Promise<FloorRead<T>>;
  /** What the cache holds for this reading now. */
  cached: () => T | undefined;
  /** Reads to try before giving up on getting past the floor. */
  attempts?: number;
  /**
   * What to do when every attempt is below the floor and the cache holds
   * nothing: "latest" returns the last reading anyway, "fail" throws so the
   * query stays unanswered and is tried again rather than store a stale
   * value as its first.
   */
  whenEmpty: "latest" | "fail";
};

/**
 * One reading for the cache, held to the account's floor. A reading
 * evaluated below the floor is stale, so it is not returned: the read is
 * tried again (up to `attempts` times, a short pause apart) and, if every
 * attempt is still below the floor, what the cache already holds is
 * returned in its place, which leaves the cache as it was. With no floor,
 * or one that has lapsed, this is a plain read. A reading that did not say
 * which ledger it was evaluated at cannot be compared, so it is accepted.
 */
export async function readAtFloor<T>({
  queryClient,
  address,
  reader,
  read,
  cached,
  attempts = GUARD_ATTEMPTS,
  whenEmpty,
}: ReadAtFloorOptions<T>): Promise<T> {
  let latest: T | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const reading = await read();
    latest = reading.value;

    // The floor is looked up after the read returns, not before it starts:
    // a read that began before a transaction confirmed must be held to the
    // floor that transaction raised.
    const floor = activeFloor(queryClient, address);
    if (!floor || reading.ledger === undefined) {
      return reading.value;
    }
    if (reading.ledger >= floor.ledger) {
      markFloorMet(queryClient, address, floor, reader);
      return reading.value;
    }

    logDiscard(address, reader, reading.ledger, floor, attempt);
    if (attempt < attempts) {
      await sleep(GUARD_RETRY_DELAY_MS * attempt);
    }
  }
  // Nothing at or above the floor. Keep what is cached.
  const held = cached();
  if (held !== undefined) {
    return held;
  }
  if (whenEmpty === "fail") {
    throw new Error("The reading is still behind the last confirmed transaction.");
  }
  return latest as T;
}

/** Reads the policy for the cache, held to the account's floor (see readAtFloor). */
export async function fetchPolicyGuarded(
  queryClient: QueryClient,
  address: string,
  attempts: number = GUARD_ATTEMPTS,
): Promise<PolicyStatus> {
  return readAtFloor({
    queryClient,
    address,
    reader: "policy",
    attempts,
    whenEmpty: "latest",
    read: async () => {
      const read = await readPolicyStatus(address);
      return { value: read.status, ledger: read.ledger };
    },
    cached: () => queryClient.getQueryData<PolicyStatus>(queryKeys.policy(address)),
  });
}

const reconciling = new Set<string>();

/**
 * Reads, in the background, until a reading at or above the account's
 * floor has been stored under `queryKey`, so a provisional value (or the
 * pre-transaction one) is replaced by the chain's own. `read` must be
 * guarded (one attempt each). Bounded, never throws, and not meant to be
 * awaited.
 */
export async function reconcileAtFloor<T>(
  queryClient: QueryClient,
  address: string,
  reader: FloorReader,
  queryKey: QueryKey,
  read: () => Promise<T>,
): Promise<void> {
  const id = `${reader}:${address}`;
  if (reconciling.has(id)) {
    return;
  }
  reconciling.add(id);
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < RECONCILE_WINDOW_MS) {
      await sleep(RECONCILE_INTERVAL_MS);
      const floor = activeFloor(queryClient, address);
      if (!floor || floor.met[reader]) {
        return;
      }
      try {
        await queryClient.fetchQuery({ queryKey, staleTime: 0, retry: false, queryFn: read });
      } catch {
        // A read that failed outright: the next turn of the loop tries again.
      }
    }
  } finally {
    reconciling.delete(id);
  }
}

/**
 * Applies a confirmed install or revoke to the policy: raises the floor to its ledger,
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
  raiseAccountFloor(queryClient, address, ledger);
  await queryClient.cancelQueries({ queryKey: queryKeys.policy(address) });
  queryClient.setQueryData(queryKeys.policy(address), outcome);
  void reconcileAtFloor(queryClient, address, "policy", queryKeys.policy(address), () => fetchPolicyGuarded(queryClient, address, 1));
}
