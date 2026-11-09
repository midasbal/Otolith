import "server-only";

import { NotFoundError } from "@stellar/stellar-sdk";
import { horizonServer } from "@/lib/stellar";

/*
  The fee budget: the floor under the deployer/keeper key's balance.

  The key pays the network fee for every sponsored deploy and every keeper
  rebalance. Whatever else goes wrong (an allowlist gap, a limit that does
  not hold), once its balance is down to the floor it stops spending, so
  the most it can lose is what sits above the floor. The floor is set to
  leave enough for the keeper's normal rebalancing: a rebalance costs a
  fraction of an XLM in fees, so 100 XLM is hundreds of them.
*/

const DEFAULT_MIN_BALANCE_XLM = 100;

// The balance is read at most this often, so a burst of requests costs one
// Horizon read. A few seconds of lag is nothing against a floor measured in
// tens of XLM.
const BALANCE_CACHE_MS = 5_000;

/** The deployer/keeper key is at or below its floor: nothing may be sponsored or submitted. */
export class FeeBudgetExhaustedError extends Error {
  constructor() {
    super("Sponsoring is paused right now. Try again later.");
    this.name = "FeeBudgetExhaustedError";
  }
}

/** The floor, in XLM: DEPLOYER_MIN_BALANCE_XLM, or the default if unset or not a non-negative number. */
export function minimumBalanceXlm(): number {
  const raw = process.env.DEPLOYER_MIN_BALANCE_XLM;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_MIN_BALANCE_XLM;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MIN_BALANCE_XLM;
}

let cached: { publicKey: string; xlm: number; readAt: number } | null = null;

/** The key's native balance in XLM; 0 for an account that does not exist; null if it could not be read. */
async function readBalanceXlm(publicKey: string): Promise<number | null> {
  if (cached && cached.publicKey === publicKey && Date.now() - cached.readAt < BALANCE_CACHE_MS) {
    return cached.xlm;
  }
  try {
    const account = await horizonServer.loadAccount(publicKey);
    const native = account.balances.find((balance) => balance.asset_type === "native");
    const xlm = native ? Number(native.balance) : 0;
    cached = { publicKey, xlm, readAt: Date.now() };
    return xlm;
  } catch (err) {
    if (err instanceof NotFoundError) {
      cached = { publicKey, xlm: 0, readAt: Date.now() };
      return 0;
    }
    return null;
  }
}

/**
 * Throws FeeBudgetExhaustedError if the key's balance is below the floor.
 * Call it immediately before anything is sponsored or submitted.
 *
 * If the balance cannot be read at all (Horizon unreachable), the call is
 * allowed through and logged: the submission that follows needs the
 * network too, and an outage of one read must not stop account creation.
 * The balance itself is never put in an error or a response.
 */
export async function assertFeeBudget(publicKey: string): Promise<void> {
  const balance = await readBalanceXlm(publicKey);
  if (balance === null) {
    console.warn(JSON.stringify({ tag: "fee-budget", event: "balance-unreadable" }));
    return;
  }
  const floor = minimumBalanceXlm();
  if (balance < floor) {
    console.warn(JSON.stringify({ tag: "fee-budget", event: "below-floor", balanceXlm: balance, floorXlm: floor }));
    throw new FeeBudgetExhaustedError();
  }
}
