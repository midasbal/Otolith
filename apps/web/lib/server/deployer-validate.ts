import "server-only";

import {
  kitDefaultDeployerAddress,
  SPONSOR_ACCOUNT_WASM_HASH,
  SPONSOR_MAX_FUND_STROOPS,
  SPONSOR_NATIVE_SAC,
} from "@/lib/server/deployer-constants";
import type { AuthEntrySummary, OperationSummary, SponsorRequestSummary, SponsorVerdict } from "@/lib/server/deployer-log";

/*
  The allowlist for the deploy sponsor (POST /api/deployer). The sponsor
  puts its own key on the transaction as source and fee payer, so what it
  must guarantee is that it only ever pays: a request may be one of four
  known operations, and may never ask the deployer to authorize anything.

  It works on the decoded summary the logger already makes, so a request
  is decoded once and the same description is both checked and logged.
  It only judges; whether a failing request is blocked is the route's
  decision (see isSponsorEnforcing in deployer-constants.ts).

  Rules for every request:
    - the payload decodes;
    - there is at least one auth entry;
    - every auth entry is an address credential, never a source-account
      one (which the deployer's signature on the transaction would satisfy);
    - no auth entry is signed by the deployer's own key.

  Then the request must be exactly one of:
    deploy   a create-contract of the account wasm, by the kit's default deployer
    fund     a native-XLM transfer from the signer to a contract, up to a cap
    install  add_context_rule on a smart account that authorizes itself,
             with our policy contract in its arguments
    revoke   remove_context_rule on a smart account that authorizes itself

  Each of the four carries exactly one auth entry: the kit asserts it for
  deploy, and the others authorize a single call by a single party.
*/

type Shape = "deploy" | "fund" | "install" | "revoke";

// Credential kinds that name an address as the signer. A source-account
// credential, and the delegated kind the kit does not use, are not among them.
const ADDRESS_CREDENTIALS = new Set(["sorobanCredentialsAddress", "sorobanCredentialsAddressV2"]);

const pass = (shape: Shape): SponsorVerdict => ({ result: "pass", shape });
const reject = (rule: string, shape?: Shape): SponsorVerdict =>
  shape ? { result: "reject", rule, shape } : { result: "reject", rule };

const isContractAddress = (address: string | undefined): address is string => address?.startsWith("C") === true;

type Invoke = Extract<OperationSummary, { type: "invoke-contract" }>;
type Create = Extract<OperationSummary, { type: "create-contract" }>;

function checkDeploy(operation: Create, auth: AuthEntrySummary[]): SponsorVerdict {
  const kitDeployer = kitDefaultDeployerAddress();
  if (operation.preimage !== "contractIdPreimageFromAddress") return reject("deploy-preimage-not-from-address", "deploy");
  if (operation.executable !== "contractExecutableWasm") return reject("deploy-executable-not-wasm", "deploy");
  if (operation.wasmHash !== SPONSOR_ACCOUNT_WASM_HASH) return reject("deploy-wasm-hash-mismatch", "deploy");
  if (operation.deployer !== kitDeployer) return reject("deploy-deployer-not-kit-default", "deploy");
  if (auth.length !== 1) return reject("deploy-auth-count", "deploy");
  if (auth[0].signer !== kitDeployer) return reject("deploy-signer-not-kit-default", "deploy");
  return pass("deploy");
}

function checkFund(operation: Invoke, auth: AuthEntrySummary[], deployerPublicKey: string | null): SponsorVerdict {
  const { transfer } = operation;
  if (operation.contract !== SPONSOR_NATIVE_SAC) return reject("fund-token-not-native", "fund");
  if (!transfer?.from || !transfer.to || transfer.amount === undefined) return reject("fund-arguments-malformed", "fund");
  if (deployerPublicKey && transfer.from === deployerPublicKey) return reject("fund-from-is-deployer", "fund");
  if (!isContractAddress(transfer.to)) return reject("fund-to-not-contract", "fund");
  if (auth.length !== 1) return reject("fund-auth-count", "fund");
  if (auth[0].signer !== transfer.from) return reject("fund-from-not-signer", "fund");
  const amount = BigInt(transfer.amount);
  if (amount <= BigInt(0)) return reject("fund-amount-not-positive", "fund");
  if (amount > SPONSOR_MAX_FUND_STROOPS) return reject("fund-amount-over-cap", "fund");
  return pass("fund");
}

// install and revoke are the same shape: a call on a smart account that the
// account itself authorizes, so the target must be the one auth entry's signer.
function checkRuleChange(shape: "install" | "revoke", operation: Invoke, auth: AuthEntrySummary[]): SponsorVerdict {
  if (!isContractAddress(operation.contract)) return reject(`${shape}-target-not-contract`, shape);
  if (auth.length !== 1) return reject(`${shape}-auth-count`, shape);
  if (auth[0].signer !== operation.contract) return reject(`${shape}-target-not-signer`, shape);
  if (shape === "install" && !operation.includesPolicyContract) return reject("install-policy-not-referenced", shape);
  return pass(shape);
}

/**
 * Judges a decoded sponsor request. Pure: it reads the summary and the
 * deployer's public key (null if the deployer is not configured, in which
 * case the sponsor itself cannot run) and returns a verdict naming the
 * first rule that failed.
 */
export function validateSponsorRequest(summary: SponsorRequestSummary, deployerPublicKey: string | null): SponsorVerdict {
  const { operation, auth } = summary;
  if (summary.decodeError || !operation) return reject("payload-not-decodable");
  if (auth.length === 0) return reject("auth-empty");
  if (auth.some((entry) => !ADDRESS_CREDENTIALS.has(entry.credential) || !entry.signer)) {
    return reject("auth-credential-not-address");
  }
  if (deployerPublicKey && auth.some((entry) => entry.signer === deployerPublicKey)) {
    return reject("auth-signer-is-deployer");
  }

  if (operation.type === "create-contract") {
    return checkDeploy(operation, auth);
  }
  if (operation.type === "invoke-contract") {
    switch (operation.function) {
      case "transfer":
        return checkFund(operation, auth, deployerPublicKey);
      case "add_context_rule":
        return checkRuleChange("install", operation, auth);
      case "remove_context_rule":
        return checkRuleChange("revoke", operation, auth);
    }
  }
  return reject("operation-not-allowed");
}
