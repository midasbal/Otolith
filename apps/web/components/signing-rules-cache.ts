import type { QueryClient } from "@tanstack/react-query";
import type { ContextRule, SmartAccountKit } from "smart-account-kit";
import { queryKeys } from "@/components/query-keys";

/*
  The account's context rules, listed once in the background so signing
  does not have to (see signing-rules.ts for why that matters and what is
  done with them).

  The listing is the kit's own rules.list(). It is kept per account, and a
  cache miss costs nothing but the speed: with nothing cached, or nothing
  fresh, signing is left to the kit, exactly as it was before this existed.

  The listing has to be dropped whenever the account's signers change. Our
  own install and revoke only add or remove a rule with a policy and no
  signers, which cannot change what a signature is bound to, but they
  refresh it all the same. A future passkey-recovery or add-signer flow
  changes exactly what this is for, and MUST call refreshSigningRules.
*/

// A listing older than this is not used. Rules change rarely and only
// through flows that refresh it, so this is a backstop, not the mechanism.
const MAX_AGE_MS = 30 * 60 * 1000;

/** Lists the account's rules in the background, if there is not a fresh listing already. */
export function prefetchSigningRules(queryClient: QueryClient, address: string, kit: SmartAccountKit): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.signingRules(address),
    queryFn: () => kit.rules.list(),
    staleTime: MAX_AGE_MS,
    retry: false,
  });
}

/** The cached listing for the account, or undefined if there is none or it has aged out. */
export function cachedSigningRules(queryClient: QueryClient, address: string): ContextRule[] | undefined {
  const state = queryClient.getQueryState<ContextRule[]>(queryKeys.signingRules(address));
  if (!state?.data || Date.now() - state.dataUpdatedAt > MAX_AGE_MS) {
    return undefined;
  }
  return state.data;
}

/**
 * Drops the account's listing and lists again in the background. Until the
 * new listing lands, signing is left to the kit.
 */
export function refreshSigningRules(queryClient: QueryClient, address: string, kit: SmartAccountKit): void {
  queryClient.removeQueries({ queryKey: queryKeys.signingRules(address) });
  void prefetchSigningRules(queryClient, address, kit);
}

/** Drops every account's listing, for a disconnect. */
export function dropSigningRules(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: queryKeys.allSigningRules });
}
