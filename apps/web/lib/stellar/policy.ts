import { Address, nativeToScVal, rpc, scValToNative, type xdr } from "@stellar/stellar-sdk";
import { simulateReadCall } from "./contract-call";
import { POLICY_CONTRACT } from "./policy-config";

// The smart account contract's own error code for "no context rule
// exists at this id" (SmartAccountError::ContextRuleNotFound, confirmed
// directly against a real testnet account: calling get_context_rule for
// an id with no rule fails with exactly this code).
//
// Rule ids are assigned once and never reused, and
// get_context_rules_count is the number of rules the account has NOW, not
// the next id: an account whose rules 1 and 2 were removed and whose
// rules 3 and 4 were added reports a count of 3 with its rules at ids 0, 3
// and 4 (confirmed on testnet). So ids cannot be assumed to run from 0 up
// to the count; findPolicyContextRule probes past the gaps, and this code
// is how a gap is told apart from a genuine, unexpected read failure.
export const CONTEXT_RULE_NOT_FOUND_ERROR = "Error(Contract, #3000)";

// The rebalance-policy contract's own NotInstalled error code (see
// contracts/rebalance-policy/src/lib.rs, Error::NotInstalled = 1).
// Confirmed directly against a real testnet account with no policy
// installed: get_params fails with exactly this text.
const POLICY_NOT_INSTALLED_ERROR = "Error(Contract, #1)";

// How many ids past the ones still missing each round of findPolicyContextRule
// asks for. Every removed rule leaves a gap that pushes the next ids one
// further up, so asking only for as many ids as the count says would need a
// second round for almost any account that has ever removed a rule, and a
// round is a full RPC round-trip. A few spare ids are cheap by comparison
// (they run in parallel and a miss is a quick error).
const RULE_PROBE_SLACK = 4;

// The most rule ids findPolicyContextRule will probe on one account. Ids
// are never reused, so this is the highest id it can find: far beyond
// anything a person installing and removing a policy reaches.
const MAX_RULE_IDS_PROBED = 256;

export type RebalancePolicyParams = {
  sellAsset: string;
  buyAsset: string;
  router: string;
  pair: string;
  oracle: string;
  sellSymbol: string;
  buySymbol: string;
  slippageToleranceBps: number;
  targetBuyWeightBps: number;
  bandThresholdBps: number;
  minTradeSize: number;
  reservedTipBps: number;
  maxCostRatioBps: number;
  cooldownSecs: number;
};

type RawRebalancePolicyParams = {
  sell_asset: string;
  buy_asset: string;
  router: string;
  pair: string;
  oracle: string;
  sell_symbol: string;
  buy_symbol: string;
  slippage_tolerance_bps: bigint | number;
  target_buy_weight_bps: bigint | number;
  band_threshold_bps: bigint | number;
  min_trade_size: bigint | number;
  reserved_tip_bps: bigint | number;
  max_cost_ratio_bps: bigint | number;
  cooldown_secs: bigint | number;
};

type RawContextRule = {
  id: number;
  policies: string[];
};

function requireRetval(simulation: rpc.Api.SimulateTransactionSuccessResponse): xdr.ScVal {
  if (!simulation.result?.retval) {
    throw new Error("The simulation succeeded but returned no value.");
  }
  return simulation.result.retval;
}

/**
 * Whether a policy is installed for a smart account, and why not when it
 * is not.
 *
 * "no-rule" is the confident case: no context rule on this account has
 * the policy contract attached at all, read directly from the account's
 * own rule metadata (get_context_rule's policies list), so this covers
 * both never-installed and fully removed.
 *
 * "params-unavailable" is a genuinely ambiguous case, called out
 * explicitly rather than silently folded into "no-rule": the account's
 * own rule metadata says the policy contract IS attached to
 * contextRuleId, but reading that installation's parameters from the
 * policy contract itself still failed with its NotInstalled error.
 * RebalancePolicyParams is written once at install() and its storage
 * TTL is never explicitly refreshed afterward, so an account that goes
 * untouched long enough could have
 * that entry archived without ever being uninstalled. This case cannot
 * be told apart, from a read alone, from some other path removing the
 * installation without updating the rule's own policy list (which
 * should not happen through the contract's normal uninstall flow, but
 * is not provable false here either). Either way, the correct
 * user-facing behavior is identical: there is no active policy, so
 * route to setup, not a fixable-looking error.
 */
export type PolicyStatus =
  | { kind: "not-installed"; reason: "no-rule" }
  | { kind: "not-installed"; reason: "params-unavailable"; contextRuleId: number }
  | {
      kind: "installed";
      contextRuleId: number;
      params: RebalancePolicyParams;
      /**
       * Set only on a status the app wrote itself from what it just
       * installed, before the chain was read back: `params.pair`, which the
       * contract derives at install, is a stand-in until the real reading
       * replaces it.
       */
      provisional?: true;
    };

function decodeParams(raw: RawRebalancePolicyParams): RebalancePolicyParams {
  return {
    sellAsset: raw.sell_asset,
    buyAsset: raw.buy_asset,
    router: raw.router,
    pair: raw.pair,
    oracle: raw.oracle,
    sellSymbol: raw.sell_symbol,
    buySymbol: raw.buy_symbol,
    slippageToleranceBps: Number(raw.slippage_tolerance_bps),
    targetBuyWeightBps: Number(raw.target_buy_weight_bps),
    bandThresholdBps: Number(raw.band_threshold_bps),
    minTradeSize: Number(raw.min_trade_size),
    reservedTipBps: Number(raw.reserved_tip_bps),
    maxCostRatioBps: Number(raw.max_cost_ratio_bps),
    cooldownSecs: Number(raw.cooldown_secs),
  };
}

/**
 * Finds which context rule (if any) on this smart account has the
 * rebalance-policy contract attached, by reading the account's own rule
 * metadata directly. The context_rule_id is never assumed to be a fixed
 * convention (rule 1 in every test deployment so far, but not a
 * contract-enforced guarantee): every rule the account actually has is
 * read and checked.
 *
 * `ledger` is the ledger the answer was evaluated at: the lowest of the
 * ledgers the simulations behind it reported, so a state that is on-chain
 * as of ledger L is in this answer whenever `ledger >= L`.
 */
async function findPolicyContextRule(smartAccount: string): Promise<{ contextRuleId: number | null; ledger: number }> {
  const countSimulation = await simulateReadCall(smartAccount, "get_context_rules_count");
  if (rpc.Api.isSimulationError(countSimulation)) {
    throw new Error(countSimulation.error);
  }
  const count = Number(scValToNative(requireRetval(countSimulation)));

  // The count is how many rules exist, so probe ids upward until that many
  // have been found, a round at a time, each round asking for as many ids
  // as are still missing plus a few spare (RULE_PROBE_SLACK): an account
  // whose rules have been removed and re-added a few times is read in one
  // round, and a longer history costs one more per few gaps. The probing is
  // capped, so an account that cannot be made sense of is read as having no
  // policy rather than read forever.
  let found = 0;
  let nextId = 0;
  let policyRuleId: number | null = null;
  let lowestLedger = countSimulation.latestLedger;
  while (found < count && nextId < MAX_RULE_IDS_PROBED) {
    const size = Math.min(count - found + RULE_PROBE_SLACK, MAX_RULE_IDS_PROBED - nextId);
    const ids = Array.from({ length: size }, (_, offset) => nextId + offset);
    nextId += size;

    const batch = await Promise.all(
      ids.map(async (id) => {
        const simulation = await simulateReadCall(smartAccount, "get_context_rule", [
          nativeToScVal(id, { type: "u32" }),
        ]);
        if (rpc.Api.isSimulationError(simulation)) {
          if (simulation.error.includes(CONTEXT_RULE_NOT_FOUND_ERROR)) {
            return { id, exists: false, hasPolicy: false, ledger: simulation.latestLedger };
          }
          throw new Error(simulation.error);
        }
        const rule = scValToNative(requireRetval(simulation)) as RawContextRule;
        return { id, exists: true, hasPolicy: rule.policies.includes(POLICY_CONTRACT), ledger: simulation.latestLedger };
      }),
    );

    for (const rule of batch) {
      lowestLedger = Math.min(lowestLedger, rule.ledger);
      if (rule.exists) {
        found += 1;
        if (rule.hasPolicy && policyRuleId === null) {
          policyRuleId = rule.id;
        }
      }
    }
  }

  return { contextRuleId: policyRuleId, ledger: lowestLedger };
}

export async function findPolicyContextRuleId(smartAccount: string): Promise<number | null> {
  return (await findPolicyContextRule(smartAccount)).contextRuleId;
}

/** A policy reading and the ledger it was evaluated at (see findPolicyContextRule). */
export type PolicyRead = { status: PolicyStatus; ledger: number };

/**
 * Reads whether a rebalance policy is installed on a smart account, and
 * its parameters if so, with the ledger the reading reflects. Read-only:
 * nothing here signs or submits anything.
 */
export async function readPolicyStatus(smartAccount: string): Promise<PolicyRead> {
  const { contextRuleId, ledger } = await findPolicyContextRule(smartAccount);
  if (contextRuleId === null) {
    return { status: { kind: "not-installed", reason: "no-rule" }, ledger };
  }

  const simulation = await simulateReadCall(POLICY_CONTRACT, "get_params", [
    Address.fromString(smartAccount).toScVal(),
    nativeToScVal(contextRuleId, { type: "u32" }),
  ]);
  const readLedger = Math.min(ledger, simulation.latestLedger);

  if (rpc.Api.isSimulationError(simulation)) {
    if (simulation.error.includes(POLICY_NOT_INSTALLED_ERROR)) {
      return { status: { kind: "not-installed", reason: "params-unavailable", contextRuleId }, ledger: readLedger };
    }
    throw new Error(simulation.error);
  }

  const raw = scValToNative(requireRetval(simulation)) as RawRebalancePolicyParams;
  return { status: { kind: "installed", contextRuleId, params: decodeParams(raw) }, ledger: readLedger };
}

/**
 * The same reading without the ledger, for callers that only need the
 * answer (the server's rebalance check).
 */
export async function getPolicyStatus(smartAccount: string): Promise<PolicyStatus> {
  return (await readPolicyStatus(smartAccount)).status;
}
