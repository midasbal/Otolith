import "server-only";

import { Keypair, hash } from "@stellar/stellar-sdk";
import { ACCOUNT_WASM_HASH } from "@/lib/stellar/account-config";
import { POLICY_CONTRACT, XLM_ASSET } from "@/lib/stellar/policy-config";

/*
  What the deploy sponsor (POST /api/deployer) is allowed to fee-sponsor,
  in one place. Everything the allowlist in deployer-validate.ts compares a
  request against comes from here; none of it is written out anywhere else
  in the sponsor.

  Two of these are tied to the smart-account-kit version and to the
  deployed contracts, and must be reviewed whenever either changes:

    - the account wasm hash (ACCOUNT_WASM_HASH): the contract every new
      smart account is created from. A new account WASM means a new hash
      here (it is shared with the browser and the keeper through
      lib/stellar/account-config.ts), or every account creation is
      rejected once enforcement is on.
    - the kit's default deployer: the well-known key the kit signs the
      create-contract authorization with. The kit derives it from a fixed
      public seed that it does not export, so the derivation is repeated
      below. If a kit upgrade changes the seed, creation is rejected once
      enforcement is on until this is updated.

  Shadow mode (DEPLOYER_ENFORCE unset) is how a change to either is caught
  before it blocks anything: the log shows the rejection.
*/

/** The account contract every smart account is created from. */
export const SPONSOR_ACCOUNT_WASM_HASH = ACCOUNT_WASM_HASH;

/** The native XLM Stellar Asset Contract: the only token a sponsored funding transfer may move. */
export const SPONSOR_NATIVE_SAC = XLM_ASSET.contract;

/** The rebalance policy contract an installed rule must reference. */
export const SPONSOR_POLICY_CONTRACT = POLICY_CONTRACT;

// smart-account-kit's DEFAULT_DEPLOYER_SEED (see the note above).
const KIT_DEFAULT_DEPLOYER_SEED = "openzeppelin-smart-account-kit";

let kitDefaultDeployer: string | null = null;

/** The kit's default deployer address. Sign-only: it authorizes a deploy and never pays. */
export function kitDefaultDeployerAddress(): string {
  if (!kitDefaultDeployer) {
    kitDefaultDeployer = Keypair.fromRawEd25519Seed(hash(Buffer.from(KIT_DEFAULT_DEPLOYER_SEED))).publicKey();
  }
  return kitDefaultDeployer;
}

const STROOPS_PER_XLM = BigInt(10_000_000);

/**
 * The most a sponsored funding transfer may move: 20,000 XLM, in stroops.
 *
 * The kit funds a new account by taking a throwaway key from Friendbot
 * (10,000 XLM on testnet) and sending everything but a 5 XLM reserve, so a
 * real transfer is about 9,995 XLM. The cap is twice that: room for
 * Friendbot to change its grant, but a bound all the same. The money is
 * the throwaway key's own, never the deployer's, which only pays the fee.
 */
export const SPONSOR_MAX_FUND_STROOPS = BigInt(20_000) * STROOPS_PER_XLM;

/**
 * Whether the sponsor blocks requests that fail the allowlist. Off unless
 * DEPLOYER_ENFORCE is "true" or "1": until then every request is checked
 * and the verdict logged, but nothing is blocked.
 */
export function isSponsorEnforcing(): boolean {
  const value = process.env.DEPLOYER_ENFORCE;
  return value === "true" || value === "1";
}
