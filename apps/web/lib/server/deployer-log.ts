import "server-only";

import { Address, StrKey, hash, scValToNative, xdr } from "@stellar/stellar-sdk";
import { kitDefaultDeployerAddress, SPONSOR_POLICY_CONTRACT } from "@/lib/server/deployer-constants";
import { NETWORK_PASSPHRASE } from "@/lib/stellar";

/**
 * Structured logging for the deploy sponsor (POST /api/deployer). One JSON
 * object per request, tagged so it can be found with a single search in the
 * function logs:
 *
 *   {"tag":"deployer-sponsor", ...}
 *
 * It describes what was asked for (the decoded host function and the
 * credential of every auth entry) and how it ended (the tx hash, or the
 * stage that failed and why). It only observes: nothing here rejects a
 * request or changes a response, and nothing here can throw into the
 * request, so a payload that does not decode is logged as such. The func
 * and auth are operation data, and no secret ever reaches this module.
 */

export const SPONSOR_LOG_TAG = "deployer-sponsor";

export type SignerRole = "deployer" | "kit-default-deployer" | "smart-account" | "other";

export type AuthEntrySummary = {
  credential: string;
  /** For address credentials: who signs, and which of the known parties that is. */
  signer?: string;
  role?: SignerRole;
  /** What the entry's root invocation authorizes, when it is a contract function. */
  authorizes?: { contract: string; function: string };
};

export type OperationSummary =
  | {
      type: "invoke-contract";
      contract: string;
      function: string;
      argCount: number;
      argTypes: string[];
      /** Distinct addresses found anywhere in the arguments, nested ones included. */
      addressesInArgs: string[];
      includesPolicyContract: boolean;
      /** For a `transfer`: the from, to and amount (in stroops), when they are the usual types. */
      transfer?: { from?: string; to?: string; amount?: string };
    }
  | {
      type: "create-contract";
      version: 1 | 2;
      preimage: string;
      deployer?: string;
      salt?: string;
      executable: string;
      wasmHash?: string;
      constructorArgCount?: number;
      contractId?: string;
    }
  | { type: "upload-wasm"; bytes: number }
  | { type: "other"; hostFunction: string };

/** What the allowlist made of a request (see deployer-validate.ts). */
export type SponsorVerdict =
  | { result: "pass"; shape: "deploy" | "fund" | "install" | "revoke" }
  | { result: "reject"; rule: string; shape?: "deploy" | "fund" | "install" | "revoke" };

export type SponsorStage = "limit" | "validate" | "configuration" | "budget" | "decode" | "prepare" | "send" | "confirm" | "unexpected";

export type SponsorOutcome =
  | { success: true; hash: string }
  | { success: false; stage: SponsorStage; reason: string };

export type SponsorRequestSummary = {
  operation: OperationSummary | null;
  auth: AuthEntrySummary[];
  /** Set when the func or the auth could not be decoded at all. */
  decodeError?: string;
};

const MAX_REASON_LENGTH = 300;
const MAX_ARG_ADDRESSES = 8;
const MAX_ARG_DEPTH = 4;

function classify(address: string, deployerPublicKey: string | null): SignerRole {
  if (deployerPublicKey && address === deployerPublicKey) {
    return "deployer";
  }
  if (address === kitDefaultDeployerAddress()) {
    return "kit-default-deployer";
  }
  return address.startsWith("C") ? "smart-account" : "other";
}

function scAddressToString(scAddress: xdr.ScAddress): string {
  return Address.fromScAddress(scAddress).toString();
}

// Every address inside an argument, however deeply it is nested in vectors
// and maps (a policy contract, for instance, is a key in a map argument).
function collectAddresses(value: xdr.ScVal, found: Set<string>, depth: number): void {
  if (depth > MAX_ARG_DEPTH || found.size >= MAX_ARG_ADDRESSES) {
    return;
  }
  const kind = value.switch().name;
  if (kind === "scvAddress") {
    found.add(scAddressToString(value.address()));
  } else if (kind === "scvVec") {
    for (const item of value.vec() ?? []) {
      collectAddresses(item, found, depth + 1);
    }
  } else if (kind === "scvMap") {
    for (const entry of value.map() ?? []) {
      collectAddresses(entry.key(), found, depth + 1);
      collectAddresses(entry.val(), found, depth + 1);
    }
  }
}

function describeInvoke(args: xdr.InvokeContractArgs): OperationSummary {
  const found = new Set<string>();
  const scArgs = args.args();
  for (const arg of scArgs) {
    collectAddresses(arg, found, 0);
  }
  const functionName = args.functionName().toString();
  const summary: OperationSummary & { type: "invoke-contract" } = {
    type: "invoke-contract",
    contract: scAddressToString(args.contractAddress()),
    function: functionName,
    argCount: scArgs.length,
    argTypes: scArgs.map((arg) => arg.switch().name),
    addressesInArgs: [...found],
    includesPolicyContract: found.has(SPONSOR_POLICY_CONTRACT),
  };
  if (functionName === "transfer" && scArgs.length === 3) {
    summary.transfer = {
      from: scArgs[0].switch().name === "scvAddress" ? scAddressToString(scArgs[0].address()) : undefined,
      to: scArgs[1].switch().name === "scvAddress" ? scAddressToString(scArgs[1].address()) : undefined,
      amount: scArgs[2].switch().name === "scvI128" ? String(scValToNative(scArgs[2])) : undefined,
    };
  }
  return summary;
}

// The contract id a create-contract call will produce: the hash of the
// network id and the id preimage, as the host computes it.
function deriveContractId(preimage: xdr.ContractIdPreimage): string {
  const hashId = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(NETWORK_PASSPHRASE)),
      contractIdPreimage: preimage,
    }),
  );
  return StrKey.encodeContract(hash(hashId.toXDR()));
}

function describeCreate(args: xdr.CreateContractArgs | xdr.CreateContractArgsV2, version: 1 | 2): OperationSummary {
  const preimage = args.contractIdPreimage();
  const executable = args.executable();
  const summary: OperationSummary & { type: "create-contract" } = {
    type: "create-contract",
    version,
    preimage: preimage.switch().name,
    executable: executable.switch().name,
  };

  if (preimage.switch().name === "contractIdPreimageFromAddress") {
    const fromAddress = preimage.fromAddress();
    summary.deployer = scAddressToString(fromAddress.address());
    summary.salt = fromAddress.salt().toString("hex");
  }
  if (executable.switch().name === "contractExecutableWasm") {
    summary.wasmHash = executable.wasmHash().toString("hex");
  }
  if (version === 2) {
    summary.constructorArgCount = (args as xdr.CreateContractArgsV2).constructorArgs().length;
  }
  try {
    summary.contractId = deriveContractId(preimage);
  } catch {
    // The id is a convenience in the log, not something to fail over.
  }
  return summary;
}

function describeOperation(func: xdr.HostFunction): OperationSummary {
  switch (func.switch().name) {
    case "hostFunctionTypeInvokeContract":
      return describeInvoke(func.invokeContract());
    case "hostFunctionTypeCreateContract":
      return describeCreate(func.createContract(), 1);
    case "hostFunctionTypeCreateContractV2":
      return describeCreate(func.createContractV2(), 2);
    case "hostFunctionTypeUploadContractWasm":
      return { type: "upload-wasm", bytes: func.wasm().length };
    default:
      return { type: "other", hostFunction: func.switch().name };
  }
}

function describeAuthEntry(entry: xdr.SorobanAuthorizationEntry, deployerPublicKey: string | null): AuthEntrySummary {
  const credentials = entry.credentials();
  const summary: AuthEntrySummary = { credential: credentials.switch().name };

  if (summary.credential === "sorobanCredentialsAddress") {
    const signer = scAddressToString(credentials.address().address());
    summary.signer = signer;
    summary.role = classify(signer, deployerPublicKey);
  } else if (summary.credential === "sorobanCredentialsAddressV2") {
    const signer = scAddressToString(credentials.addressV2().address());
    summary.signer = signer;
    summary.role = classify(signer, deployerPublicKey);
  }

  const fn = entry.rootInvocation().function();
  if (fn.switch().name === "sorobanAuthorizedFunctionTypeContractFn") {
    const contractFn = fn.contractFn();
    summary.authorizes = {
      contract: scAddressToString(contractFn.contractAddress()),
      function: contractFn.functionName().toString(),
    };
  }
  return summary;
}

/**
 * Decodes a sponsor request into a short, loggable description. Never
 * throws: a payload that cannot be decoded comes back with `decodeError`.
 * Each part is decoded on its own, so a bad auth entry does not hide a
 * good host function.
 */
export function summarizeSponsorRequest(
  func: string,
  auth: string[],
  deployerPublicKey: string | null,
): SponsorRequestSummary {
  const summary: SponsorRequestSummary = { operation: null, auth: [] };
  const problems: string[] = [];

  try {
    summary.operation = describeOperation(xdr.HostFunction.fromXDR(func, "base64"));
  } catch (err) {
    problems.push(`func: ${err instanceof Error ? err.message : "could not be decoded"}`);
  }

  auth.forEach((encoded, index) => {
    try {
      summary.auth.push(describeAuthEntry(xdr.SorobanAuthorizationEntry.fromXDR(encoded, "base64"), deployerPublicKey));
    } catch (err) {
      problems.push(`auth[${index}]: ${err instanceof Error ? err.message : "could not be decoded"}`);
    }
  });

  if (problems.length > 0) {
    summary.decodeError = problems.join("; ").slice(0, MAX_REASON_LENGTH);
  }
  return summary;
}

/** Keeps a failure reason to a line's worth of text. */
export function shortReason(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason);
  return text.slice(0, MAX_REASON_LENGTH);
}

/**
 * Writes the request's one log line. Logging must never break the request
 * it describes, so a failure to serialize is swallowed.
 */
export function logSponsorRequest(record: {
  summary: SponsorRequestSummary | null;
  /** The allowlist's verdict and whether it was being enforced; null if the request never got that far. */
  verdict: (SponsorVerdict & { mode: "shadow" | "enforce" }) | null;
  outcome: SponsorOutcome;
  durationMs: number;
}): void {
  try {
    console.log(
      JSON.stringify({
        tag: SPONSOR_LOG_TAG,
        at: new Date().toISOString(),
        durationMs: record.durationMs,
        ...record.summary,
        verdict: record.verdict,
        outcome: record.outcome,
      }),
    );
  } catch {
    // Nothing useful to do: the request itself is unaffected.
  }
}
