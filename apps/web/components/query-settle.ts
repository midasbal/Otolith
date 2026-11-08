import type { QueryClient, QueryKey } from "@tanstack/react-query";

/*
  Settling reads, for the moment right after an action.

  When a transaction is confirmed, the first read that follows can still
  see the chain as it was before it: the RPC answers from whichever node
  it reaches, and that node can be a ledger or two behind the one that
  confirmed the transaction. A read taken at that moment is a perfectly
  successful read of the wrong state, and left in the cache it would be
  served as the truth until something happened to read again.

  settleQuery reads again, a bounded number of times with a growing pause
  (the same shape as connectWalletWithSettlingRetry in
  wallet-provider.tsx), until the result is the one the action should have
  produced, and only then puts it in the cache.
*/

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 750;
// No new attempt is begun once this long has passed since the first.
const SETTLE_WINDOW_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SettleOptions<T> = {
  queryClient: QueryClient;
  queryKey: QueryKey;
  /** One fresh read of the chain, straight from the source and not through the cache. */
  read: () => Promise<T>;
  /** Whether a read shows the state the action should have produced. */
  isSettled: (data: T) => boolean;
};

/**
 * Reads until `isSettled`, then stores that result under `queryKey`.
 *
 * The settling runs as the query's own fetch, so a page that opens in the
 * meantime and asks for the same key joins it instead of starting a read
 * of its own that could land the old state in the cache. Any fetch
 * already running for the key is cancelled first, so it cannot do the
 * same.
 *
 * If the state never shows within the bounds, nothing is hung and nothing
 * is thrown: the last read is what the cache holds, and the query is
 * invalidated so it reads again the ordinary way, which is what happened
 * before settling existed. Resolves to whether it settled.
 */
export async function settleQuery<T>({ queryClient, queryKey, read, isSettled }: SettleOptions<T>): Promise<boolean> {
  const startedAt = Date.now();
  let settled = false;
  // The query keeps this function as its own after the fetch, and any later
  // plain refetch of the key (the invalidation below, or one from elsewhere
  // in the app) runs it again. Once settling is over it must be one read.
  let settling = true;

  await queryClient.cancelQueries({ queryKey });
  try {
    await queryClient.fetchQuery({
      queryKey,
      staleTime: 0,
      retry: false,
      queryFn: async () => {
        if (!settling) {
          return read();
        }
        let latest: T | undefined;
        let latestError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          try {
            latest = await read();
            latestError = undefined;
            if (isSettled(latest)) {
              settled = true;
              return latest;
            }
          } catch (err) {
            latestError = err;
          }
          const wait = RETRY_DELAY_MS * attempt;
          if (attempt === MAX_ATTEMPTS || Date.now() - startedAt + wait > SETTLE_WINDOW_MS) {
            break;
          }
          await sleep(wait);
        }
        if (latest !== undefined) {
          return latest;
        }
        throw latestError;
      },
    });
  } catch (err) {
    // Not one read succeeded. The cache keeps what it had; the invalidation
    // below tries again the ordinary way.
    console.error(err);
  } finally {
    settling = false;
  }

  if (!settled) {
    void queryClient.invalidateQueries({ queryKey, refetchType: "all" });
  }
  return settled;
}
