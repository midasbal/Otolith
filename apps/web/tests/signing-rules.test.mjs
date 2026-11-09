// Tests for the pre-listed signing rules (components/signing-rules.ts).
//
// Run with `npm test`. The module is TypeScript, so it is compiled on the
// fly with the project's own TypeScript, and loaded with the real
// stellar-sdk and smart-account-kit, so the XDR and signer helpers under test
// are the ones the app uses.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const sdk = await import("@stellar/stellar-sdk");
const kit = await import("smart-account-kit");

const source = fs.readFileSync(path.join(root, "components/signing-rules.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: "ES2020" } }).outputText;
const loaded = { exports: {} };
new Function("module", "exports", "require", compiled)(loaded, loaded.exports, (name) =>
  name === "@stellar/stellar-sdk" ? sdk : name === "smart-account-kit" ? kit : require(name),
);
const { resolveSigningRuleIds, signingRuleResolver } = loaded.exports;

// ---- fixtures -------------------------------------------------------------

const verifier = sdk.Address.contract(Buffer.alloc(32, 1)).toString();
const passkey = (label) => ({ tag: "External", values: [verifier, Buffer.concat([Buffer.alloc(65, 4), Buffer.from(label)])] });
const MINE = passkey("my-credential");
const OTHER = passkey("someone-else");
const MY_CREDENTIAL = kit.getCredentialIdFromSigner(MINE);
const ACCOUNT = sdk.Address.contract(Buffer.alloc(32, 7)).toString();
const POLICY = sdk.Address.contract(Buffer.alloc(32, 9)).toString();

const rule = (id, { type = { tag: "Default" }, signers = [], policies = [] } = {}) => ({
  id,
  name: `rule ${id}`,
  context_type: type,
  signers,
  policies,
  valid_until: undefined,
});

const address = (a) => new sdk.Address(a).toScAddress();
function callOn(contract, subs = []) {
  return new sdk.xdr.SorobanAuthorizedInvocation({
    function: sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new sdk.xdr.InvokeContractArgs({ contractAddress: address(contract), functionName: "remove_context_rule", args: [] }),
    ),
    subInvocations: subs,
  });
}
const entry = (root) =>
  new sdk.xdr.SorobanAuthorizationEntry({
    credentials: sdk.xdr.SorobanCredentials.sorobanCredentialsAddress(
      new sdk.xdr.SorobanAddressCredentials({
        address: address(ACCOUNT),
        nonce: sdk.xdr.Int64.fromString("1"),
        signatureExpirationLedger: 1,
        signature: sdk.xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: root,
  });
const createEntry = () =>
  new sdk.xdr.SorobanAuthorizationEntry({
    credentials: sdk.xdr.SorobanCredentials.sorobanCredentialsAddress(
      new sdk.xdr.SorobanAddressCredentials({
        address: address(ACCOUNT),
        nonce: sdk.xdr.Int64.fromString("1"),
        signatureExpirationLedger: 1,
        signature: sdk.xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new sdk.xdr.SorobanAuthorizedInvocation({
      function: sdk.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractHostFn(
        new sdk.xdr.CreateContractArgs({
          contractIdPreimage: sdk.xdr.ContractIdPreimage.contractIdPreimageFromAddress(
            new sdk.xdr.ContractIdPreimageFromAddress({ address: address(ACCOUNT), salt: Buffer.alloc(32) }),
          ),
          executable: sdk.xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32)),
        }),
      ),
      subInvocations: [],
    }),
  });

// The shape of the real account this was measured against: rule 0 is the
// passkey's Default rule; a later rule carries the rebalance policy, no signers.
const realisticRules = [rule(0, { signers: [MINE] }), rule(5, { policies: [POLICY] })];

// ---- cache hit ------------------------------------------------------------

test("cache hit: the listed rules give the passkey's rule, as the kit's own discovery does", () => {
  assert.deepEqual(resolveSigningRuleIds(realisticRules, MY_CREDENTIAL, [entry(callOn(ACCOUNT))]), [[0]]);
});

test("cache hit: signAndSubmit gets a resolver that answers per entry, in order", () => {
  const entries = [entry(callOn(ACCOUNT)), entry(callOn(ACCOUNT))];
  const resolver = signingRuleResolver(realisticRules, MY_CREDENTIAL, () => entries);
  assert.equal(typeof resolver, "function");
  assert.deepEqual(resolver(entries[0], 0), [0]);
  assert.deepEqual(resolver(entries[1], 1), [0]);
});

test("cache hit: a nested call is bound to a rule per call", () => {
  const nested = entry(callOn(ACCOUNT, [callOn(POLICY)]));
  assert.deepEqual(resolveSigningRuleIds(realisticRules, MY_CREDENTIAL, [nested]), [[0, 0]]);
});

test("a rule scoped to the exact call wins over a Default one, as in the kit", () => {
  const rules = [
    rule(0, { signers: [MINE] }),
    rule(1, { type: { tag: "CallContract", values: [ACCOUNT] }, signers: [MINE] }),
  ];
  assert.deepEqual(resolveSigningRuleIds(rules, MY_CREDENTIAL, [entry(callOn(ACCOUNT))]), [[1]]);
});

test("a single applicable rule is the answer whatever its signers, as in the kit", () => {
  const rules = [rule(2, { signers: [MINE, OTHER] })];
  assert.deepEqual(resolveSigningRuleIds(rules, MY_CREDENTIAL, [entry(callOn(ACCOUNT))]), [[2]]);
});

// ---- cache miss and declining ---------------------------------------------

test("cache miss: no listing means no resolver, so the kit discovers the ids itself", () => {
  assert.equal(signingRuleResolver(undefined, MY_CREDENTIAL, () => [entry(callOn(ACCOUNT))]), undefined);
});

test("cache miss: no connected credential means no resolver", () => {
  assert.equal(signingRuleResolver(realisticRules, undefined, () => [entry(callOn(ACCOUNT))]), undefined);
});

test("an unreadable transaction (its simulation failed) means no resolver, not an error", () => {
  const broken = () => {
    throw new Error("Transaction simulation failed");
  };
  assert.equal(signingRuleResolver(realisticRules, MY_CREDENTIAL, broken), undefined);
});

test("declines when the passkey is not a signer on any listed rule", () => {
  assert.equal(resolveSigningRuleIds([rule(0, { signers: [OTHER] })], MY_CREDENTIAL, [entry(callOn(ACCOUNT))]), null);
});

test("declines when two different signers carry the connected credential", () => {
  const clash = { tag: "External", values: [sdk.Address.contract(Buffer.alloc(32, 3)).toString(), MINE.values[1]] };
  assert.equal(resolveSigningRuleIds([rule(0, { signers: [MINE] }), rule(1, { signers: [clash] })], MY_CREDENTIAL, [entry(callOn(ACCOUNT))]), null);
});

test("declines where the kit would give up: no single rule can be settled on", () => {
  const rules = [rule(0, { signers: [MINE] }), rule(1, { signers: [MINE] })];
  assert.equal(resolveSigningRuleIds(rules, MY_CREDENTIAL, [entry(callOn(ACCOUNT))]), null);
});

test("declines for an entry that authorizes anything but contract calls", () => {
  assert.equal(resolveSigningRuleIds(realisticRules, MY_CREDENTIAL, [createEntry()]), null);
});

test("an empty listing declines", () => {
  assert.equal(resolveSigningRuleIds([], MY_CREDENTIAL, [entry(callOn(ACCOUNT))]), null);
});
