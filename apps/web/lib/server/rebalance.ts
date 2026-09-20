import "server-only";

import { Account, Address, Keypair, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { SmartAccountKit, MemoryStorage, type TransactionResult } from "smart-account-kit";
import { NETWORK_PASSPHRASE, SOROBAN_RPC_URL, sorobanServer, getPolicyStatus } from "@/lib/stellar";
import { BUY_ASSET, ORACLE, REBALANCER_CONTRACT, ROUTER, SELL_ASSET, POLICY_CONTRACT } from "@/lib/stellar/policy-config";
import { getDeployerKeypair, DeployerNotConfiguredError } from "@/lib/server/deployer";

/**
 * Published, already-deployed OpenZeppelin smart account WASM and
 * WebAuthn verifier for Protocol 27 testnet, matching
 * components/wallet-provider.tsx exactly. Duplicated rather than
 * imported: that file is a client component ("use client") and this
 * module runs server-only, so it cannot import from it.
 */
const ACCOUNT_WASM_HASH = "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a";
const WEBAUTHN_VERIFIER_ADDRESS = "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F";

const DEADLINE_SECONDS = 3600;

export type RebalanceState =
  | { state: "no_policy" }
  | { state: "not_due"; reason: string }
  | { state: "ready"; contextRuleId: number; amountIn: string; amountOut: string }
  | { state: "cooldown" }
  | { state: "pool_blocked" }
  | { state: "error"; message: string };

export type RebalanceTriggerResult =
  | { submitted: true; hash: string; ledger: number | null }
  | RebalanceState;

// Rebalancer's own error codes (contracts/rebalancer/src/lib.rs). Safe to
// read as this contract's own meaning for any low code seen here, since
// we always build a correctly-shaped call (right recipient, right
// whitelisted path): the rebalance-policy contract also defines low
// codes that collide numerically (WrongRecipient=5, AssetNotWhitelisted=7,
// WrongSender=9), but those preconditions can never occur from our own
// call, so a collision is never actually ambiguous in practice here.
const REBALANCER_ERRORS: Record<number, string> = {
  1: "PriceMissing",
  2: "PriceStale",
  3: "Overflow",
  4: "NoValue",
  5: "BelowBand",
  6: "BelowMinTradeSize",
  7: "CostExceedsBenefit",
  8: "OvershootTolerance",
  9: "PriceInvalid",
};

// rebalance-policy's own codes that never collide with the rebalancer's
// range above (contracts/rebalance-policy/src/lib.rs).
const POLICY_COOLDOWN_ERROR_CODE = 22;
const POLICY_TRADE_TOO_LARGE_CODE = 23;

// Soroswap router's own generic insufficient-output error, confirmed
// against real testnet transactions (contracts/rebalance-policy/RESULTS.md).
// Never defined by either of our own contracts.
const ROUTER_INSUFFICIENT_OUTPUT_CODE = 507;

function parseContractErrorCode(message: string): number | null {
  const match = message.match(/Error\(Contract, #(\d+)\)/);
  return match ? Number(match[1]) : null;
}

function buildRebalanceOperation(account: string, contextRuleId: number, deadline: number) {
  return Operation.invokeContractFunction({
    contract: REBALANCER_CONTRACT,
    function: "rebalance",
    args: [
      new Address(account).toScVal(),
      new Address(POLICY_CONTRACT).toScVal(),
      nativeToScVal(contextRuleId, { type: "u32" }),
      new Address(ROUTER).toScVal(),
      new Address(ORACLE).toScVal(),
      new Address(SELL_ASSET.contract).toScVal(),
      new Address(BUY_ASSET.contract).toScVal(),
      xdr.ScVal.scvSymbol(SELL_ASSET.symbol),
      xdr.ScVal.scvSymbol(BUY_ASSET.symbol),
      nativeToScVal(deadline, { type: "u64" }),
    ],
  });
}

/**
 * Runs the read-only simulation that both decides eligibility and, on
 * success, is the exact call later assembled and submitted. Never signs
 * or submits anything.
 */
async function simulateRebalance(account: string, contextRuleId: number) {
  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;
  const op = buildRebalanceOperation(account, contextRuleId, deadline);

  const dummySource = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(dummySource, { fee: "10000000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(op)
    .setTimeout(120)
    .build();

  const sim = await sorobanServer.simulateTransaction(tx, undefined, "record_allow_nonroot");
  return { tx, sim };
}

function classifySimulationError(message: string): RebalanceState {
  const code = parseContractErrorCode(message);
  if (code === null) {
    return { state: "error", message: "The rebalance simulation failed in an unrecognized way." };
  }
  if (code === ROUTER_INSUFFICIENT_OUTPUT_CODE) {
    return { state: "pool_blocked" };
  }
  if (code === POLICY_COOLDOWN_ERROR_CODE) {
    return { state: "cooldown" };
  }
  if (code === POLICY_TRADE_TOO_LARGE_CODE) {
    // Only reachable if a rule's own params changed underneath a
    // concurrent trigger, or a stale amount is retried; treat the same
    // as not due rather than a hard error.
    return { state: "not_due", reason: "TradeTooLarge" };
  }
  const rebalancerReason = REBALANCER_ERRORS[code];
  if (rebalancerReason) {
    return { state: "not_due", reason: rebalancerReason };
  }
  return { state: "error", message: `The rebalance simulation failed with an unrecognized contract error (#${code}).` };
}

/**
 * Checks whether a rebalance is currently due for a smart account,
 * without submitting anything. The account address is the only input
 * trusted from the client; the context rule id is discovered here, the
 * same way the dashboard's own policy-status read does.
 */
export async function checkRebalance(account: string): Promise<RebalanceState> {
  const status = await getPolicyStatus(account);
  if (status.kind === "not-installed") {
    return { state: "no_policy" };
  }

  const { sim } = await simulateRebalance(account, status.contextRuleId);
  if (rpc.Api.isSimulationError(sim)) {
    return classifySimulationError(sim.error);
  }

  const [amountIn, amountOut] = scValToNative(sim.result!.retval) as [bigint, bigint];
  return {
    state: "ready",
    contextRuleId: status.contextRuleId,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
  };
}

/**
 * Submits a real permissionless rebalance, sourced and fee-paid by our
 * own deployer/keeper key, exactly the path proven end to end on
 * testnet: discovery-simulate, assemble, then
 * kit.multiSigners.operation() with zero selected signers. Never
 * submits a doomed transaction: re-checks eligibility first and returns
 * the same state, unsubmitted, if it is not "ready".
 */
export async function triggerRebalance(account: string): Promise<RebalanceTriggerResult> {
  const deployer = getDeployerKeypair();

  const status = await getPolicyStatus(account);
  if (status.kind === "not-installed") {
    return { state: "no_policy" };
  }

  const { tx, sim } = await simulateRebalance(account, status.contextRuleId);
  if (rpc.Api.isSimulationError(sim)) {
    return classifySimulationError(sim.error);
  }

  const assembledTx = rpc.assembleTransaction(tx, sim).build();

  const kit = new SmartAccountKit({
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    accountWasmHash: ACCOUNT_WASM_HASH,
    webauthnVerifierAddress: WEBAUTHN_VERIFIER_ADDRESS,
    deployerSecret: deployer.secret(),
    storage: new MemoryStorage(),
    indexerUrl: false,
  });

  // The kit's public connection API assumes a wallet connected through
  // its own createWallet/connectWallet flow (passkey backed). A
  // permissionless keeper submission targets a smart account the kit
  // was never connected to that way at all, so its private
  // initializeWallet/contractId internals are set directly instead.
  const kitInternal = kit as unknown as { initializeWallet: (contractId: string) => void; _contractId: string };
  kitInternal.initializeWallet(account);
  kitInternal._contractId = account;

  // multi-signer-manager.js only ever reads assembledTx.built at
  // runtime; it never needs the rest of the real AssembledTransaction
  // shape, matching the same proven call shape from
  // rebalance-hardened.js. Cast rather than construct the real type.
  type OperationArg = Parameters<typeof kit.multiSigners.operation>[0];
  const result: TransactionResult = await kit.multiSigners.operation(
    { built: assembledTx } as unknown as OperationArg,
    [],
    { resolveContextRuleIds: () => [status.contextRuleId, status.contextRuleId] },
  );

  if (!result.success) {
    return { state: "error", message: result.error?.message || "The rebalance transaction failed to submit." };
  }

  return { submitted: true, hash: result.hash, ledger: result.ledger ?? null };
}

export { DeployerNotConfiguredError };
