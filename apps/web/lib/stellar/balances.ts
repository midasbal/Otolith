import { NotFoundError, type Horizon } from "@stellar/stellar-sdk";
import { horizonServer } from "./config";

export type AssetBalance = {
  code: string;
  issuer: string | null;
  balance: string;
};

export type AccountBalancesResult =
  | { kind: "funded"; balances: AssetBalance[] }
  | { kind: "not-found" };

function toAssetBalance(line: Horizon.HorizonApi.BalanceLine): AssetBalance {
  if (line.asset_type === "native") {
    return { code: "XLM", issuer: null, balance: line.balance };
  }
  if (line.asset_type === "liquidity_pool_shares") {
    return { code: "Liquidity pool shares", issuer: null, balance: line.balance };
  }
  return { code: line.asset_code, issuer: line.asset_issuer, balance: line.balance };
}

/**
 * Fetches an account's native and trustline balances from Horizon. A
 * brand-new testnet address that has never been funded does not exist as
 * far as Horizon is concerned, so that case is returned as `not-found`
 * rather than thrown, and callers should treat it as "no balances yet".
 */
export async function getAccountBalances(publicKey: string): Promise<AccountBalancesResult> {
  try {
    const account = await horizonServer.loadAccount(publicKey);
    return { kind: "funded", balances: account.balances.map(toAssetBalance) };
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { kind: "not-found" };
    }
    throw err;
  }
}
