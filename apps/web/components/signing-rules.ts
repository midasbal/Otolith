import { Address, type xdr } from "@stellar/stellar-sdk";
import {
  collectUniqueSigners,
  getCredentialIdFromSigner,
  signersEqual,
  type ContextRule,
  type ContractSigner,
} from "smart-account-kit";

/*
  Which context rules a passkey signature is bound to.

  A smart account signature commits to the id of the context rule that
  authorizes it. The kit works that id out itself, just before it asks for
  the passkey: it lists the account's rules (an indexer call and a string of
  one-at-a-time reads, a long wait) and picks the rule for each call the
  entry authorizes. signAndSubmit accepts a resolver of its own instead, and
  when it is given one the kit does none of that.

  So the rules are listed ahead of time, in the background, with the kit's
  own public rules.list() (the same enumeration the kit would have run), and
  this module makes the pick from that list. The pick is the kit's pick,
  step for step (smart-account-kit 0.5.1, kit/context-rules.js,
  resolveContextRuleIdsForEntry):

    1. The rules that apply to a call are the Default rules and the rules
       scoped to exactly that call. If there is one, it is the answer.
    2. Otherwise, the rules whose signers are exactly the signing passkey,
       preferring a scoped rule over a Default one. If there is one, it is
       the answer.
    3. Otherwise, the policy-free rules whose signers are all the signing
       passkey, with the same preference. If there is one, it is the answer.

  Where the kit gives up and throws (no single rule), this returns null, and
  so does anything it cannot be sure of, so the caller leaves the kit to do
  its own discovery. A wrong answer here would not be quiet (the signature
  would fail to verify on-chain), but no answer is always safe.

  This is tied to the pinned kit version. If the kit changes how it chooses,
  this must change with it; the differential check in tests/ is what to
  re-run on an upgrade. Anything that changes the account's signers, such as
  a passkey-recovery flow, must also drop the cached rule list (see
  signing-rules-cache.ts).
*/

type ContextType =
  | { tag: "Default" }
  | { tag: "CallContract"; address: string };

function ruleContextKey(rule: ContextRule): string {
  const type = rule.context_type;
  if (type.tag === "Default") return "Default";
  if (type.tag === "CallContract") return `CallContract:${type.values[0]}`;
  return `CreateContract:${Buffer.from(type.values[0]).toString("hex")}`;
}

function contextKey(context: ContextType): string {
  return context.tag === "Default" ? "Default" : `CallContract:${context.address}`;
}

/**
 * The calls an auth entry authorizes, root and nested, as the contexts a
 * rule must cover. Null if it authorizes anything but contract calls (a
 * contract creation, say): the kit has its own handling for those.
 */
function entryContexts(entry: xdr.SorobanAuthorizationEntry): ContextType[] | null {
  const contexts: ContextType[] = [];
  let supported = true;
  const walk = (invocation: xdr.SorobanAuthorizedInvocation) => {
    const fn = invocation.function();
    if (fn.switch().name === "sorobanAuthorizedFunctionTypeContractFn") {
      contexts.push({ tag: "CallContract", address: Address.fromScAddress(fn.contractFn().contractAddress()).toString() });
    } else {
      supported = false;
    }
    for (const sub of invocation.subInvocations()) {
      walk(sub);
    }
  };
  walk(entry.rootInvocation());
  return supported ? contexts : null;
}

function preferSpecific(rules: ContextRule[]): ContextRule[] {
  const specific = rules.filter((rule) => rule.context_type.tag !== "Default");
  return specific.length > 0 ? specific : rules;
}

function pickRuleId(rules: ContextRule[], context: ContextType, signer: ContractSigner): number | null {
  const candidates = rules.filter(
    (rule) => rule.context_type.tag === "Default" || ruleContextKey(rule) === contextKey(context),
  );
  if (candidates.length === 1) {
    return candidates[0].id;
  }

  const exact = preferSpecific(
    candidates.filter(
      (rule) => rule.signers.length === 1 && signersEqual(rule.signers[0], signer),
    ),
  );
  if (exact.length === 1) {
    return exact[0].id;
  }

  const subset = preferSpecific(
    candidates.filter((rule) => rule.policies.length === 0 && rule.signers.every((ruleSigner) => signersEqual(ruleSigner, signer))),
  );
  if (subset.length === 1) {
    return subset[0].id;
  }
  return null;
}

/**
 * The context rule ids to sign each of `entries` with, from a listing of the
 * account's rules, or null if any of them cannot be settled with certainty.
 */
export function resolveSigningRuleIds(
  rules: ContextRule[],
  credentialId: string,
  entries: xdr.SorobanAuthorizationEntry[],
): number[][] | null {
  // The signer the kit would sign with: the one passkey signer, across all
  // the rules, that belongs to the connected credential. Not exactly one
  // means the kit has to decide, not this.
  const signers = collectUniqueSigners(
    rules.flatMap((rule) => rule.signers.filter((signer) => getCredentialIdFromSigner(signer) === credentialId)),
  );
  if (signers.length !== 1) {
    return null;
  }

  const resolved: number[][] = [];
  for (const entry of entries) {
    const contexts = entryContexts(entry);
    if (!contexts) {
      return null;
    }
    const ids: number[] = [];
    for (const context of contexts) {
      const id = pickRuleId(rules, context, signers[0]);
      if (id === null) {
        return null;
      }
      ids.push(id);
    }
    resolved.push(ids);
  }
  return resolved;
}

/**
 * A resolver for signAndSubmit's `resolveContextRuleIds` option built from a
 * listing of the account's rules, or undefined if there is no listing or it
 * cannot settle this transaction, in which case nothing is passed and the
 * kit discovers the ids itself, exactly as it does without any of this.
 *
 * The entries are the transaction's own simulated auth entries, the same
 * ones, in the same order, the kit hands its resolver.
 */
export function signingRuleResolver(
  rules: ContextRule[] | undefined,
  credentialId: string | undefined,
  entries: () => xdr.SorobanAuthorizationEntry[],
): ((entry: xdr.SorobanAuthorizationEntry, index: number) => number[]) | undefined {
  if (!rules || !credentialId) {
    return undefined;
  }
  try {
    const resolved = resolveSigningRuleIds(rules, credentialId, entries());
    if (!resolved) {
      return undefined;
    }
    return (_entry, index) => resolved[index];
  } catch {
    return undefined;
  }
}
