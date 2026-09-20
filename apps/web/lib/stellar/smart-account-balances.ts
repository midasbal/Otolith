import { Address, rpc, scValToNative } from "@stellar/stellar-sdk";
import { simulateReadCall } from "./contract-call";

// Public testnet native XLM Stellar Asset Contract (SAC), the same
// address used for the smart-account deploy flow (see
// components/wallet-provider.tsx). Every asset on Stellar, including
// native XLM, has a token contract implementing the standard
// balance(id: Address) -> i128 function; this is that function's
// address for native XLM specifically.
const NATIVE_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export type SmartAccountAssetBalance = {
  code: string;
  contract: string;
  balance: string;
};

export type SmartAccountBalancesResult =
  | { kind: "empty" }
  | { kind: "funded"; balances: SmartAccountAssetBalance[] };

/** An additional Stellar Asset Contract to check, with the ticker to
 * display for it (for example, from a policy's own sell_symbol/
 * buy_symbol), rather than showing the raw contract address. */
export type ExtraTokenContract = {
  contract: string;
  code: string;
};

const ZERO = BigInt(0);
const STROOPS_PER_XLM = BigInt(10_000_000);

function stroopsToDecimalString(raw: bigint): string {
  const negative = raw < ZERO;
  const magnitude = negative ? -raw : raw;
  const whole = magnitude / STROOPS_PER_XLM;
  const fraction = (magnitude % STROOPS_PER_XLM).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

/**
 * Reads a single token's balance for a holder address as a read-only
 * Soroban RPC simulation.
 */
async function readTokenBalance(tokenContract: string, holder: string): Promise<bigint> {
  const holderScVal = Address.fromString(holder).toScVal();
  const simulation = await simulateReadCall(tokenContract, "balance", [holderScVal]);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error);
  }

  const retval = simulation.result?.retval;
  if (!retval) {
    return ZERO;
  }

  return BigInt(scValToNative(retval));
}

/**
 * Reads a smart account's (a Soroban contract address, not a classic
 * account) asset balances.
 *
 * This differs from a classic account on purpose: Horizon's classic
 * account endpoint (what getAccountBalances in ./balances.ts reads) only
 * covers G-addresses, and has no concept of a C-address at all. A
 * contract holds no ledger-visible "balances" list the way a classic
 * account does; each asset's balance for a given holder is read by
 * calling that asset's own Stellar Asset Contract's standard
 * balance(id: Address) function, one asset at a time, as a read-only
 * simulation, since there is no Soroban equivalent of "list every asset
 * this address holds" the way Horizon lists trustlines.
 *
 * A freshly deployed, not yet funded smart account is not an error case:
 * the token contract's balance() function returns 0 for any address with
 * no recorded balance, funded or not, rather than failing. That shows up
 * here as `{ kind: "empty" }` when every checked balance is zero, the
 * same outward meaning as a classic account's not-found case, from a
 * different mechanism.
 *
 * extraTokenContracts lets additional Stellar Asset Contracts be checked
 * once there is a way to know which assets a given account actually
 * holds, for example a policy's own sell_asset/buy_asset once one is
 * installed. Only native XLM is checked otherwise.
 */
/**
 * De-duplicates a list of tokens by contract address, keeping the first
 * entry seen for each address. Native XLM is always listed first (see
 * below), so when a policy's own assets also include it, its proper
 * "XLM" ticker wins over a duplicate entry rather than either being
 * read or rendered twice.
 */
function dedupeByContract(tokens: ExtraTokenContract[]): ExtraTokenContract[] {
  const seen = new Set<string>();
  const unique: ExtraTokenContract[] = [];
  for (const token of tokens) {
    if (seen.has(token.contract)) {
      continue;
    }
    seen.add(token.contract);
    unique.push(token);
  }
  return unique;
}

export async function getSmartAccountBalances(
  contractId: string,
  extraTokenContracts: ExtraTokenContract[] = [],
): Promise<SmartAccountBalancesResult> {
  const tokens = dedupeByContract([{ code: "XLM", contract: NATIVE_SAC }, ...extraTokenContracts]);

  const rawBalances = await Promise.all(tokens.map((token) => readTokenBalance(token.contract, contractId)));

  const hasAnyBalance = rawBalances.some((amount) => amount !== ZERO);
  if (!hasAnyBalance) {
    return { kind: "empty" };
  }

  const balances: SmartAccountAssetBalance[] = tokens.map((token, i) => ({
    code: token.code,
    contract: token.contract,
    balance: stroopsToDecimalString(rawBalances[i]),
  }));

  return { kind: "funded", balances };
}
