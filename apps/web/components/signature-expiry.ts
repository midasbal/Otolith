import { LEDGERS_PER_HOUR, type SmartAccountKit } from "smart-account-kit";

/**
 * The ledger a signature made now should expire at: the latest ledger plus
 * the kit's signing window, which is the hour the kit defaults to (this app
 * does not configure another).
 *
 * This is the same figure the kit works out for itself just before it asks
 * for the passkey, from the same read. Passing it to signAndSubmit as the
 * `expiration` option lets that read run alongside building the
 * transaction instead of after it, which takes a round-trip off the wait
 * before the prompt. Resolves to undefined if the read fails, in which case
 * the kit works the figure out itself, as it always did.
 */
export async function signatureExpirationLedger(kit: SmartAccountKit): Promise<number | undefined> {
  try {
    const { sequence } = await kit.rpc.getLatestLedger();
    return sequence + LEDGERS_PER_HOUR;
  } catch {
    return undefined;
  }
}
