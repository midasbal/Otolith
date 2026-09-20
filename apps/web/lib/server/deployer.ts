import "server-only";

import { BASE_FEE, Keypair, Operation, TransactionBuilder, rpc, xdr } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, sorobanServer } from "@/lib/stellar";

/**
 * The deployer keypair sponsors smart-account deploy fees on behalf of a
 * new user. It is fee-only: it never becomes a signer on any user's smart
 * account. Its secret lives only in the server-side DEPLOYER_SECRET_KEY
 * environment variable, never in a NEXT_PUBLIC_ variable and never in any
 * file this repo tracks. See .env.example for the documented placeholder,
 * and .env.local (gitignored) for where the real value actually lives.
 *
 * The `server-only` import above is a build-time guard: if this module is
 * ever imported, even transitively, from a client component, the build
 * fails with an explicit error instead of silently bundling the secret.
 */

export class DeployerNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployerNotConfiguredError";
  }
}

let cachedKeypair: Keypair | null = null;

function loadDeployerKeypair(): Keypair {
  const secret = process.env.DEPLOYER_SECRET_KEY;
  if (!secret) {
    throw new DeployerNotConfiguredError(
      "DEPLOYER_SECRET_KEY is not set. Add it to .env.local (server-only, never committed).",
    );
  }

  try {
    return Keypair.fromSecret(secret);
  } catch {
    throw new DeployerNotConfiguredError("DEPLOYER_SECRET_KEY is not a valid Stellar secret key.");
  }
}

/**
 * Returns the deployer keypair, loading and caching it from the
 * server-only environment on first use. Throws DeployerNotConfiguredError
 * if the secret is missing or malformed. Never logs or returns the secret
 * itself.
 */
export function getDeployerKeypair(): Keypair {
  if (!cachedKeypair) {
    cachedKeypair = loadDeployerKeypair();
  }
  return cachedKeypair;
}

/**
 * Returns only the deployer's public key. Safe to include in a response
 * sent to the client.
 */
export function getDeployerPublicKey(): string {
  return getDeployerKeypair().publicKey();
}

export class DeploySponsorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploySponsorError";
  }
}

export interface SponsorResult {
  hash: string;
}

/**
 * Sponsors a smart-account deploy authorization built by smart-account-kit
 * client-side. The client signs the deploy authorization entry with the
 * kit's shared, public, well-known default deployer key (never a secret:
 * that key's role is only to authorize the deploy, and it is never a
 * signer on the resulting account). This function is the other half: it
 * pays the network fee and submits the transaction using our own funded
 * deployer key, which likewise never becomes a signer on any account it
 * pays for.
 *
 * The request shape (`func`, `auth`, both base64 XDR strings) matches
 * smart-account-kit's own RelayerClient wire format exactly, so the
 * client kit can be configured with `relayerUrl` pointed at this route
 * and call it automatically, with no extra client-side plumbing.
 */
export async function sponsorHostFunctionCall(func: string, auth: string[]): Promise<SponsorResult> {
  const deployer = getDeployerKeypair();

  let hostFunction: xdr.HostFunction;
  let authEntries: xdr.SorobanAuthorizationEntry[];
  try {
    hostFunction = xdr.HostFunction.fromXDR(func, "base64");
    authEntries = auth.map((entry) => xdr.SorobanAuthorizationEntry.fromXDR(entry, "base64"));
  } catch {
    throw new DeploySponsorError("The deploy payload could not be decoded.");
  }

  const account = await sorobanServer.getAccount(deployer.publicKey());

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.invokeHostFunction({ func: hostFunction, auth: authEntries }))
    .setTimeout(30)
    .build();

  let prepared;
  try {
    prepared = await sorobanServer.prepareTransaction(transaction);
  } catch (err) {
    console.error(err);
    throw new DeploySponsorError("The deploy transaction could not be prepared.");
  }

  prepared.sign(deployer);

  const sendResult = await sorobanServer.sendTransaction(prepared);
  if (sendResult.status === "ERROR") {
    console.error(sendResult);
    throw new DeploySponsorError("The deploy transaction was rejected before submission.");
  }

  const final = await sorobanServer.pollTransaction(sendResult.hash, { attempts: 15 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    console.error(final);
    throw new DeploySponsorError("The deploy transaction did not succeed on-chain.");
  }

  return { hash: sendResult.hash };
}
