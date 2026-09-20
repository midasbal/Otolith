import { Address, nativeToScVal, rpc, scValToNative, type xdr } from "@stellar/stellar-sdk";
import { simulateReadCall } from "./contract-call";
import { POLICY_CONTRACT } from "./policy-config";

// The smart account contract's own error code for "no context rule
// exists at this id" (SmartAccountError::ContextRuleNotFound, confirmed
// directly against a real testnet account: calling get_context_rule for
// an id past the end of the account's rule history fails with exactly
// this code). get_context_rules_count is a monotonic "ever created"
// counter, not a count of currently active rules, so ids in range can
// still be missing if a rule was removed; this lets that be told apart
// from a genuine, unexpected read failure.
const CONTEXT_RULE_NOT_FOUND_ERROR = "Error(Contract, #3000)";

// The rebalance-policy contract's own NotInstalled error code (see
// contracts/rebalance-policy/src/lib.rs, Error::NotInstalled = 1).
// Confirmed directly against a real testnet account with no policy
// installed: get_params fails with exactly this text.
const POLICY_NOT_INSTALLED_ERROR = "Error(Contract, #1)";

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
  | { kind: "installed"; contextRuleId: number; params: RebalancePolicyParams };

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
 * Finds which context rule id (if any) on this smart account has the
 * rebalance-policy contract attached, by reading the account's own rule
 * metadata directly. The context_rule_id is never assumed to be a fixed
 * convention (rule 1 in every test deployment so far, but not a
 * contract-enforced guarantee): every rule the account actually has is
 * read and checked.
 */
export async function findPolicyContextRuleId(smartAccount: string): Promise<number | null> {
  const countSimulation = await simulateReadCall(smartAccount, "get_context_rules_count");
  if (rpc.Api.isSimulationError(countSimulation)) {
    throw new Error(countSimulation.error);
  }
  const count = Number(scValToNative(requireRetval(countSimulation)));

  const ruleIds = Array.from({ length: count }, (_, id) => id);
  const matches = await Promise.all(
    ruleIds.map(async (id) => {
      const simulation = await simulateReadCall(smartAccount, "get_context_rule", [
        nativeToScVal(id, { type: "u32" }),
      ]);
      if (rpc.Api.isSimulationError(simulation)) {
        if (simulation.error.includes(CONTEXT_RULE_NOT_FOUND_ERROR)) {
          return null;
        }
        throw new Error(simulation.error);
      }
      const rule = scValToNative(requireRetval(simulation)) as RawContextRule;
      return rule.policies.includes(POLICY_CONTRACT) ? id : null;
    }),
  );

  const found = matches.find((id) => id !== null);
  return found === undefined ? null : found;
}

/**
 * Reads whether a rebalance policy is installed on a smart account, and
 * its parameters if so. Read-only: nothing here signs or submits
 * anything.
 */
export async function getPolicyStatus(smartAccount: string): Promise<PolicyStatus> {
  const contextRuleId = await findPolicyContextRuleId(smartAccount);
  if (contextRuleId === null) {
    return { kind: "not-installed", reason: "no-rule" };
  }

  const simulation = await simulateReadCall(POLICY_CONTRACT, "get_params", [
    Address.fromString(smartAccount).toScVal(),
    nativeToScVal(contextRuleId, { type: "u32" }),
  ]);

  if (rpc.Api.isSimulationError(simulation)) {
    if (simulation.error.includes(POLICY_NOT_INSTALLED_ERROR)) {
      return { kind: "not-installed", reason: "params-unavailable", contextRuleId };
    }
    throw new Error(simulation.error);
  }

  const raw = scValToNative(requireRetval(simulation)) as RawRebalancePolicyParams;
  return { kind: "installed", contextRuleId, params: decodeParams(raw) };
}
