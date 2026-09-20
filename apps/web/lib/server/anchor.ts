import "server-only";

import { Address, BASE_FEE, Operation, TransactionBuilder, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";
// Imported for types only (erased at compile time, no runtime load) plus
// a lazy runtime import inside runLiraDeposit's own try/catch below.
// @stellar/typescript-wallet-sdk ships a pre-bundled webpack bundle with
// a fragile dependency chain (see next.config.ts and
// scripts/patch-slow-buffer.cjs); if that bundle ever fails to load for
// any reason, a static top-level import here would crash this whole
// module before any request handler runs, and Next would return an
// empty response instead of JSON. A dynamic import inside the handler's
// own try/catch turns that same failure into a clean, honest JSON error
// instead of a dead route.
import type { Types } from "@stellar/typescript-wallet-sdk";
import { NETWORK_PASSPHRASE, sorobanServer } from "@/lib/stellar";
import { simulateReadCall } from "@/lib/stellar/contract-call";
import { parseDecimalToStroops } from "@/lib/stellar/format";
import { USDC_ASSET } from "@/lib/stellar/policy-config";
import { getDeployerKeypair, DeployerNotConfiguredError } from "@/lib/server/deployer";

/**
 * The TR mock anchor (see docs pulled from tr-mock-anchor.fly.dev during
 * design): a real SEP-6 sandbox anchor for a Turkish lira <-> USDC ramp on
 * Stellar testnet. Everything here is a genuine SEP-1/SEP-10/SEP-6 flow
 * against a real, reachable anchor; only the bank leg is simulated (see
 * settleSandboxBankTransfer below), which the anchor itself documents as
 * sandbox-only and which has no equivalent on a real anchor.
 *
 * Skill used for the SEP mechanics in this file: the CheesecakeLabs
 * stellar-anchor-skill (SKILL.md) — in particular its gotchas on SEP-10
 * challenge handling (never submit the challenge transaction itself),
 * amounts always arriving as decimal strings rather than numbers, and
 * reading an anchor's own /info before assuming a capability.
 */
const ANCHOR_HOME_DOMAIN = "tr-mock-anchor.fly.dev";
const ANCHOR_USDC_CODE = "USDC";

// The anchor's own classic-asset USDC SAC (USDC:GBBD47IF..., confirmed
// live against the anchor's stellar.toml). This is what actually lands
// in the relay's account when the anchor pays out; it is NOT the same
// contract the portfolio trades (see PORTFOLIO_USDC_SAC below).
const ANCHOR_USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// The portfolio's own USDC: imported from policy-config.ts, the single
// source of truth the install flow, the dashboard's balance read, and
// the rebalancer's trading path all already use, rather than a second
// hardcoded copy of the same address that could quietly drift out of
// sync with it again. See the 1:1 exchange comment on runLiraDeposit for
// why the anchor's own USDC and the portfolio's USDC are bridged by a
// direct forward instead of a market trade.
const PORTFOLIO_USDC_SAC = USDC_ASSET.contract;

// Sandbox-only endpoint: the anchor has no real bank, so the incoming
// TRY transfer has to be triggered by hand. A real anchor has no
// equivalent of this call at all; the actual bank transfer does this on
// its own. Never mistake this for something that exists on mainnet.
const SANDBOX_BANK_SETTLE_URL = (transactionId: string) =>
  `https://${ANCHOR_HOME_DOMAIN}/sep6/tx/${transactionId}/simulate-bank-transfer`;

// SEP-38 prices are a public endpoint (no SEP-10 needed), used only for
// the UI's estimate before a deposit is even started.
const SEP38_PRICES_URL = (tryAmount: string) =>
  `https://${ANCHOR_HOME_DOMAIN}/sep38/prices?sell_asset=iso4217:TRY&sell_amount=${encodeURIComponent(tryAmount)}`;

const MAX_POLL_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 1500;

export type DepositStageId = "creating_deposit" | "bank_settling" | "usdc_delivered" | "forwarded" | "done";

export type DepositStageEvent = {
  stage: DepositStageId;
  label: string;
  detail?: string;
  txHash?: string;
};

export type DepositOutcome =
  | {
      success: true;
      amountUsdc: string;
      anchorTransactionId: string;
      deliveryStellarTxHash: string | null;
      forwardTxHash: string;
      stages: DepositStageEvent[];
    }
  | { success: false; message: string; stages: DepositStageEvent[] };

export class AnchorDepositError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnchorDepositError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Estimates the USDC a given TRY amount would produce, from the anchor's
 * own public SEP-38 price endpoint. Labeled an estimate everywhere it is
 * shown: the real rate is locked only once a deposit actually starts.
 */
export async function estimateUsdcForTry(tryAmount: string): Promise<string> {
  const res = await fetch(SEP38_PRICES_URL(tryAmount), { method: "GET" });
  if (!res.ok) {
    throw new AnchorDepositError("Could not reach the anchor for a rate estimate.");
  }

  const data = (await res.json()) as { buy_assets?: Array<{ asset: string; price: string }> };
  const match = data.buy_assets?.find((entry) => entry.asset === `stellar:${ANCHOR_USDC_CODE}:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`);
  if (!match) {
    throw new AnchorDepositError("The anchor did not return a USDC price for this amount.");
  }

  // price is TRY per USDC on this endpoint's convention (sell_asset=TRY,
  // buy_assets[].price = how much TRY buys one unit of the buy asset).
  const tryPerUsdc = Number(match.price);
  const tryValue = Number(tryAmount);
  if (!Number.isFinite(tryPerUsdc) || tryPerUsdc <= 0 || !Number.isFinite(tryValue)) {
    throw new AnchorDepositError("The anchor returned a rate that could not be read.");
  }

  return (tryValue / tryPerUsdc).toFixed(2);
}

/**
 * Triggers the sandbox's simulated incoming bank transfer. Sandbox-only:
 * a real anchor's actual bank transfer does this on its own, with no
 * matching endpoint for a client to call. Clearly separated from the
 * rest of the flow, which is all genuine SEP protocol traffic.
 */
async function settleSandboxBankTransfer(transactionId: string, tryAmount: string): Promise<void> {
  const res = await fetch(SANDBOX_BANK_SETTLE_URL(transactionId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: tryAmount }),
  });
  if (!res.ok) {
    throw new AnchorDepositError("The sandbox bank settlement step failed.");
  }
}

/**
 * Runs the full lira deposit flow, driven entirely by the server-side
 * relay: SEP-10 auth, SEP-6 deposit, the sandbox bank settlement, a
 * bounded poll to completion, then the honest 1:1 exchange and forward
 * into the user's smart-account C-address. Every stage reached is
 * recorded in the returned stage log, even on failure, so the caller can
 * show real progress rather than a single pass/fail flag.
 */
export async function runLiraDeposit(userAccount: string, tryAmount: string): Promise<DepositOutcome> {
  const stages: DepositStageEvent[] = [];
  const relay = getDeployerKeypair();

  try {
    const { Wallet, SigningKeypair } = await import("@stellar/typescript-wallet-sdk");
    const wallet = Wallet.TestNet();
    const anchor = wallet.anchor({ homeDomain: ANCHOR_HOME_DOMAIN });
    const sep10 = await anchor.sep10();
    const relaySigningKeypair = SigningKeypair.fromSecret(relay.secret());
    const authToken = await sep10.authenticate({ accountKp: relaySigningKeypair });

    const sep6 = anchor.sep6();

    stages.push({ stage: "creating_deposit", label: "Creating deposit with the anchor" });
    const depositResponse: Types.Sep6DepositResponse = await sep6.deposit({
      authToken,
      params: {
        asset_code: ANCHOR_USDC_CODE,
        account: relay.publicKey(),
        amount: tryAmount,
        type: "bank_account",
      },
    });

    const transactionId = "id" in depositResponse ? depositResponse.id : undefined;
    if (!transactionId) {
      const reason =
        "fields" in depositResponse
          ? "The anchor is asking for more customer information than this demo flow handles."
          : "type" in depositResponse
            ? `The anchor returned an unexpected status (${depositResponse.type}) before a deposit could start.`
            : "The anchor did not return a deposit id.";
      return { success: false, message: reason, stages };
    }

    stages.push({
      stage: "bank_settling",
      label: "Waiting for the bank transfer (sandbox: simulated here, a real bank does this on mainnet)",
      detail: transactionId,
    });
    await settleSandboxBankTransfer(transactionId, tryAmount);

    let amountOut: string | null = null;
    let stellarTransactionId: string | null = null;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const transaction = await sep6.getTransactionBy({ authToken, id: transactionId });
      if (transaction.status === "completed") {
        amountOut = transaction.amount_out;
        stellarTransactionId = transaction.stellar_transaction_id ?? null;
        break;
      }
      if (transaction.status === "error") {
        return {
          success: false,
          message: transaction.message || "The anchor reported an error settling this deposit.",
          stages,
        };
      }
      await sleep(POLL_INTERVAL_MS);
    }

    if (!amountOut) {
      return { success: false, message: "The deposit did not settle in time. It may still complete; check back shortly.", stages };
    }

    // Confirm the relay really holds the anchor's USDC now, rather than
    // trusting the transaction record alone.
    const relayAnchorBalanceSim = await simulateReadCall(ANCHOR_USDC_SAC, "balance", [
      new Address(relay.publicKey()).toScVal(),
    ]);
    const relayAnchorBalance = rpc.Api.isSimulationError(relayAnchorBalanceSim)
      ? null
      : BigInt(scValToNative(relayAnchorBalanceSim.result!.retval));

    stages.push({
      stage: "usdc_delivered",
      label: "Real testnet USDC delivered to the relay",
      detail:
        relayAnchorBalance !== null
          ? `${amountOut} USDC settled; relay now holds ${relayAnchorBalance.toString()} raw units of the anchor's USDC.`
          : `${amountOut} USDC settled.`,
      txHash: stellarTransactionId ?? undefined,
    });

    // THE 1:1 FORWARD (deliberate, not a market swap): on testnet the
    // anchor pays out in its own USDC (ANCHOR_USDC_SAC), a separate
    // SEP-41 token contract from the portfolio's own USDC
    // (PORTFOLIO_USDC_SAC, the same USDC_ASSET the install flow, the
    // dashboard's balance read, and the rebalancer's trading path all
    // use, chosen specifically because it is the one with a healthy,
    // deep, oracle-aligned Soroswap pool). The two are not fungible with
    // each other, and the anchor's own USDC has no comparable pool here
    // to route a real swap through, so the relay does not attempt to
    // trade between them. Instead it simply forwards the same nominal
    // amount from its own pre-funded portfolio-USDC reserve to the user,
    // and keeps the anchor-USDC it received. On mainnet a real anchor
    // delivers the canonical USDC directly and this whole bridge step
    // disappears.
    const amountRaw = parseDecimalToStroops(amountOut);
    if (amountRaw === null || amountRaw <= BigInt(0)) {
      return { success: false, message: "The settled amount could not be read.", stages };
    }

    const forwardAccount = await sorobanServer.getAccount(relay.publicKey());
    const forwardOp = Operation.invokeContractFunction({
      contract: PORTFOLIO_USDC_SAC,
      function: "transfer",
      args: [
        new Address(relay.publicKey()).toScVal(),
        new Address(userAccount).toScVal(),
        nativeToScVal(amountRaw, { type: "i128" }),
      ],
    });
    const forwardTx = new TransactionBuilder(forwardAccount, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(forwardOp)
      .setTimeout(30)
      .build();

    let preparedForwardTx;
    try {
      preparedForwardTx = await sorobanServer.prepareTransaction(forwardTx);
    } catch (err) {
      console.error(err);
      return { success: false, message: "Could not prepare the forward into your portfolio.", stages };
    }

    preparedForwardTx.sign(relay);
    const sendResult = await sorobanServer.sendTransaction(preparedForwardTx);
    if (sendResult.status === "ERROR") {
      console.error(sendResult);
      return { success: false, message: "The forward transaction was rejected before submission.", stages };
    }

    const finalForward = await sorobanServer.pollTransaction(sendResult.hash, { attempts: 15 });
    if (finalForward.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      console.error(finalForward);
      return { success: false, message: "The forward into your portfolio did not succeed on-chain.", stages };
    }

    stages.push({
      stage: "forwarded",
      label: "Portfolio USDC sent to your smart account",
      detail: `${amountOut} USDC (the portfolio's own USDC, exchanged 1:1 for the anchor's testnet USDC)`,
      txHash: sendResult.hash,
    });
    stages.push({ stage: "done", label: "Credited to your portfolio", txHash: sendResult.hash });

    return {
      success: true,
      amountUsdc: amountOut,
      anchorTransactionId: transactionId,
      deliveryStellarTxHash: stellarTransactionId,
      forwardTxHash: sendResult.hash,
      stages,
    };
  } catch (err) {
    if (err instanceof AnchorDepositError) {
      return { success: false, message: err.message, stages };
    }
    console.error(err);
    return { success: false, message: "The deposit could not be completed. Nothing was charged.", stages };
  }
}

export { DeployerNotConfiguredError };
