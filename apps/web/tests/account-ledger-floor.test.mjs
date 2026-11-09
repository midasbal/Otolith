// Tests for the account ledger floor (components/account-ledger-floor.ts) and
// the three readers held to it: the policy (the same file), the rebalance
// check (components/rebalance-check-floor.ts) and the balances
// (components/balances-floor.ts).
//
// Run with `npm test`. The modules are TypeScript, so they are compiled on the
// fly with the project's own TypeScript and loaded against a real
// QueryClient. The chain reads are stubbed, and time is controlled with the
// test runner's mock timers (setTimeout and Date), so nothing here waits on a
// real clock or touches the network.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, test, mock } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const { QueryClient } = await import("@tanstack/react-query");

// ---- loading the modules under test ----------------------------------------

// What the readers read the chain through. Each test sets what it needs.
const chain = {
  readPolicyStatus: async () => {
    throw new Error("readPolicyStatus was not stubbed");
  },
  readSmartAccountBalances: async () => {
    throw new Error("readSmartAccountBalances was not stubbed");
  },
};
const stubs = {
  "@/lib/stellar": {
    readPolicyStatus: (...args) => chain.readPolicyStatus(...args),
    readSmartAccountBalances: (...args) => chain.readSmartAccountBalances(...args),
  },
};

const modules = new Map();
function load(file) {
  if (modules.has(file)) {
    return modules.get(file).exports;
  }
  const source = fs.readFileSync(path.join(root, `${file}.ts`), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: "ES2020" } }).outputText;
  const loaded = { exports: {} };
  modules.set(file, loaded);
  new Function("module", "exports", "require", compiled)(loaded, loaded.exports, (name) => {
    if (stubs[name]) return stubs[name];
    if (name.startsWith("@/")) return load(name.slice(2));
    return require(name);
  });
  return loaded.exports;
}

const { queryKeys } = load("components/query-keys");
const floorModule = load("components/account-ledger-floor");
const { raiseAccountFloor, readAtFloor, fetchPolicyGuarded, reconcileAtFloor, applyConfirmedPolicy, FLOOR_WINDOW_MS, FLOOR_LOG_TAG } = floorModule;
const { fetchRebalanceCheckGuarded } = load("components/rebalance-check-floor");
const { fetchBalancesGuarded } = load("components/balances-floor");

// ---- helpers ---------------------------------------------------------------

let accountCounter = 0;
// A fresh account per test: the reconcile guard is keyed by account.
const newAccount = () => `C-TEST-ACCOUNT-${(accountCounter += 1)}`;

function newClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The same defaults the app sets (components/query-provider.tsx).
  client.setQueryDefaults(queryKeys.allAccountFloors, { gcTime: Infinity, staleTime: Infinity });
  return client;
}

const floorOf = (client, account) => client.getQueryData(queryKeys.accountFloor(account));

// Lets promise callbacks run without moving the mocked clock.
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Moves the mocked clock forward in small steps, letting the code under test
// run between them, so timers that are set while it runs are honored too.
async function advance(ms, step = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await flush();
    mock.timers.tick(step);
  }
  await flush();
}

// Runs the mocked clock until the promise settles, and returns its result.
async function drive(promise, limitMs = 120_000) {
  let state = "pending";
  let value;
  promise.then(
    (result) => {
      state = "resolved";
      value = result;
    },
    (error) => {
      state = "rejected";
      value = error;
    },
  );
  for (let elapsed = 0; state === "pending" && elapsed < limitMs; elapsed += 50) {
    await flush();
    mock.timers.tick(50);
  }
  await flush();
  assert.notEqual(state, "pending", "the promise did not settle within the mocked time limit");
  if (state === "rejected") throw value;
  return value;
}

// A read the test controls: each call takes the next scripted answer (the
// last one repeats), and the calls are counted.
function scripted(answers) {
  let calls = 0;
  const read = async () => {
    const answer = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    return answer;
  };
  read.calls = () => calls;
  return read;
}

const reading = (value, ledger) => ({ value, ledger });
const policyRead = (kind, ledger) => ({ status: { kind, reason: "no-rule" }, ledger });
const logs = [];

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  logs.length = 0;
  mock.method(console, "log", (line) => logs.push(line));
});

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

const discards = () => logs.map((line) => JSON.parse(line)).filter((entry) => entry.tag === FLOOR_LOG_TAG && entry.event === "discarded-stale-read");

// ---- holding a stale read --------------------------------------------------

test("a read below the floor is held, retried up to the bound, then the cached value is used", async () => {
  const client = newClient();
  const account = newAccount();
  raiseAccountFloor(client, account, 100);
  client.setQueryData(queryKeys.balances(account), "cached");
  const read = scripted([reading("stale", 90)]);

  const result = await drive(
    client.fetchQuery({
      queryKey: queryKeys.balances(account),
      staleTime: 0,
      queryFn: () =>
        readAtFloor({ queryClient: client, address: account, reader: "balances", read, cached: () => client.getQueryData(queryKeys.balances(account)), attempts: 3, whenEmpty: "latest" }),
    }),
  );

  assert.equal(read.calls(), 3, "three attempts, the bound");
  assert.equal(result, "cached");
  assert.equal(client.getQueryData(queryKeys.balances(account)), "cached", "the stale value was never written");
  assert.notEqual(floorOf(client, account).met.balances, true, "the floor was not met");
  const logged = discards();
  assert.equal(logged.length, 3);
  assert.deepEqual(
    { reader: logged[0].reader, readLedger: logged[0].readLedger, floorLedger: logged[0].floorLedger, behindBy: logged[0].behindBy },
    { reader: "balances", readLedger: 90, floorLedger: 100, behindBy: 10 },
  );
});

test("a retry that reaches the floor is the value returned", async () => {
  const client = newClient();
  const account = newAccount();
  raiseAccountFloor(client, account, 100);
  const read = scripted([reading("stale", 90), reading("fresh", 100)]);

  const result = await drive(
    readAtFloor({ queryClient: client, address: account, reader: "balances", read, cached: () => "cached", whenEmpty: "latest" }),
  );

  assert.equal(result, "fresh");
  assert.equal(read.calls(), 2);
  assert.equal(floorOf(client, account).met.balances, true);
});

// ---- accepting a read at or above the floor --------------------------------

test("a read at or above the floor is written and marks that reader's met flag", async () => {
  for (const ledger of [100, 105]) {
    const client = newClient();
    const account = newAccount();
    raiseAccountFloor(client, account, 100);
    const read = scripted([reading("fresh", ledger)]);

    const result = await drive(
      client.fetchQuery({
        queryKey: queryKeys.balances(account),
        staleTime: 0,
        queryFn: () => readAtFloor({ queryClient: client, address: account, reader: "balances", read, cached: () => undefined, whenEmpty: "latest" }),
      }),
    );

    assert.equal(result, "fresh");
    assert.equal(client.getQueryData(queryKeys.balances(account)), "fresh");
    assert.equal(read.calls(), 1, "no retry needed");
    assert.deepEqual(floorOf(client, account).met, { balances: true });
    assert.equal(discards().length, 0);
  }
});

test("with no floor, a read is simply returned", async () => {
  const client = newClient();
  const account = newAccount();
  const read = scripted([reading("anything", 1)]);

  const result = await drive(
    readAtFloor({ queryClient: client, address: account, reader: "policy", read, cached: () => "cached", whenEmpty: "latest" }),
  );

  assert.equal(result, "anything");
  assert.equal(read.calls(), 1);
});

// ---- per-reader met --------------------------------------------------------

test("one reader meeting the floor does not stop another reader's reconcile", async () => {
  const client = newClient();
  const account = newAccount();
  raiseAccountFloor(client, account, 100);

  // The balances reader meets the floor.
  await drive(
    readAtFloor({ queryClient: client, address: account, reader: "balances", read: scripted([reading("b", 100)]), cached: () => undefined, whenEmpty: "latest" }),
  );
  assert.deepEqual(floorOf(client, account).met, { balances: true });

  // The check's reconcile starts afterwards and still runs: its own flag is unset.
  const checkRead = scripted([reading("old-check", 90), reading("new-check", 100)]);
  client.setQueryData(queryKeys.rebalanceCheck(account), "optimistic-check");
  const reconcile = reconcileAtFloor(client, account, "rebalanceCheck", queryKeys.rebalanceCheck(account), () =>
    readAtFloor({
      queryClient: client,
      address: account,
      reader: "rebalanceCheck",
      attempts: 1,
      read: checkRead,
      cached: () => client.getQueryData(queryKeys.rebalanceCheck(account)),
      whenEmpty: "fail",
    }),
  );
  await drive(reconcile);

  assert.equal(checkRead.calls(), 2, "it read again after the first read was behind");
  assert.equal(client.getQueryData(queryKeys.rebalanceCheck(account)), "new-check");
  assert.deepEqual(floorOf(client, account).met, { balances: true, rebalanceCheck: true });
});

test("a reconcile ends at once when its own reader has already met the floor", async () => {
  const client = newClient();
  const account = newAccount();
  raiseAccountFloor(client, account, 100);
  await drive(
    readAtFloor({ queryClient: client, address: account, reader: "rebalanceCheck", read: scripted([reading("c", 100)]), cached: () => undefined, whenEmpty: "fail" }),
  );
  const read = scripted([reading("never", 100)]);

  await drive(reconcileAtFloor(client, account, "rebalanceCheck", queryKeys.rebalanceCheck(account), read));

  assert.equal(read.calls(), 0);
});

// ---- the window ------------------------------------------------------------

test("the floor holds for its window, then a below-floor read is accepted", async () => {
  // At the very end of the window the floor still holds.
  {
    const client = newClient();
    const account = newAccount();
    raiseAccountFloor(client, account, 100);
    mock.timers.tick(FLOOR_WINDOW_MS);
    const read = scripted([reading("stale", 90)]);
    const result = await drive(
      readAtFloor({ queryClient: client, address: account, reader: "balances", attempts: 1, read, cached: () => "cached", whenEmpty: "latest" }),
    );
    assert.equal(result, "cached");
  }
  // One millisecond past it, it has lapsed and the read is accepted.
  {
    const client = newClient();
    const account = newAccount();
    raiseAccountFloor(client, account, 100);
    mock.timers.tick(FLOOR_WINDOW_MS + 1);
    const read = scripted([reading("stale", 90)]);
    const result = await drive(
      readAtFloor({ queryClient: client, address: account, reader: "balances", read, cached: () => "cached", whenEmpty: "latest" }),
    );
    assert.equal(result, "stale");
    assert.equal(read.calls(), 1, "no retries once the floor has lapsed");
    assert.equal(floorOf(client, account).met.balances, undefined, "a lapsed floor is not marked met");
  }
});

// ---- a read with no ledger -------------------------------------------------

test("a read with no ledger is accepted, since it cannot be compared", async () => {
  const client = newClient();
  const account = newAccount();
  raiseAccountFloor(client, account, 100);
  const read = scripted([reading("unknown-age", undefined)]);

  const result = await drive(
    readAtFloor({ queryClient: client, address: account, reader: "rebalanceCheck", read, cached: () => "cached", whenEmpty: "fail" }),
  );

  assert.equal(result, "unknown-age");
  assert.equal(read.calls(), 1);
  assert.equal(floorOf(client, account).met.rebalanceCheck, undefined, "an uncomparable read does not meet the floor");
});

// ---- nothing cached, every read stale --------------------------------------

test("with nothing cached and every read stale, the readers differ as designed", async () => {
  const staleLedger = 90;
  const floorLedger = 100;

  // Balances: the latest reading is returned rather than hold the screen on loading.
  {
    const client = newClient();
    const account = newAccount();
    raiseAccountFloor(client, account, floorLedger);
    chain.readSmartAccountBalances = scripted([{ result: { kind: "funded", balances: [] }, ledger: staleLedger }]);
    const result = await drive(fetchBalancesGuarded(client, account));
    assert.deepEqual(result, { kind: "funded", balances: [] });
    assert.equal(chain.readSmartAccountBalances.calls(), 3);
  }

  // Rebalance check: it fails, so the query stays unanswered and is tried again
  // rather than store a stale check as its first answer.
  {
    const client = newClient();
    const account = newAccount();
    raiseAccountFloor(client, account, floorLedger);
    let fetches = 0;
    const realFetch = global.fetch;
    global.fetch = async () => {
      fetches += 1;
      return { json: async () => ({ state: "no_policy", ledger: staleLedger }) };
    };
    try {
      await assert.rejects(drive(fetchRebalanceCheckGuarded(client, account)), /still behind the last confirmed transaction/);
      assert.equal(fetches, 3);
    } finally {
      global.fetch = realFetch;
    }
    assert.equal(client.getQueryData(queryKeys.rebalanceCheck(account)), undefined, "nothing stale was stored");
  }

  // Policy: like balances, the latest reading is returned. (Stage 1 kept this
  // from before the floor existed: `cached ?? latest`.)
  {
    const client = newClient();
    const account = newAccount();
    raiseAccountFloor(client, account, floorLedger);
    chain.readPolicyStatus = scripted([policyRead("not-installed", staleLedger)]);
    const result = await drive(fetchPolicyGuarded(client, account));
    assert.equal(result.kind, "not-installed");
    assert.equal(chain.readPolicyStatus.calls(), 3);
  }
});

test("with a value cached, every reader keeps it when every read is stale", async () => {
  const client = newClient();
  const account = newAccount();
  raiseAccountFloor(client, account, 100);

  const installed = { kind: "installed", contextRuleId: 3 };
  client.setQueryData(queryKeys.policy(account), installed);
  chain.readPolicyStatus = scripted([policyRead("not-installed", 90)]);
  assert.equal(await drive(fetchPolicyGuarded(client, account)), installed);

  const check = { state: "ready" };
  client.setQueryData(queryKeys.rebalanceCheck(account), check);
  const realFetch = global.fetch;
  global.fetch = async () => ({ json: async () => ({ state: "no_policy", ledger: 90 }) });
  try {
    assert.equal(await drive(fetchRebalanceCheckGuarded(client, account)), check);
  } finally {
    global.fetch = realFetch;
  }

  const balances = { kind: "funded", balances: [{ code: "XLM", contract: "x", balance: "1.0000000" }] };
  client.setQueryData(queryKeys.balances(account), balances);
  chain.readSmartAccountBalances = scripted([{ result: { kind: "empty" }, ledger: 90 }]);
  assert.equal(await drive(fetchBalancesGuarded(client, account)), balances);
});

// ---- raising the floor -----------------------------------------------------

test("raiseAccountFloor only ever raises the floor", () => {
  const client = newClient();
  const account = newAccount();

  raiseAccountFloor(client, account, 100);
  const first = floorOf(client, account);
  assert.equal(first.ledger, 100);

  raiseAccountFloor(client, account, 90);
  assert.equal(floorOf(client, account), first, "a lower ledger changes nothing");

  raiseAccountFloor(client, account, 100);
  assert.equal(floorOf(client, account), first, "the same ledger changes nothing");

  mock.timers.tick(5_000);
  raiseAccountFloor(client, account, 110);
  const raised = floorOf(client, account);
  assert.equal(raised.ledger, 110);
  assert.equal(raised.raisedAt, first.raisedAt + 5_000, "a higher ledger restarts the window");
  assert.deepEqual(raised.met, {}, "and clears what had met the old floor");
});

test("floors are kept apart per account", () => {
  const client = newClient();
  const one = newAccount();
  const two = newAccount();
  raiseAccountFloor(client, one, 100);
  assert.equal(floorOf(client, two), undefined);
});

// ---- the guard runs as the query's own fetch --------------------------------

test("a read that starts while another is in flight joins it instead of racing it", async () => {
  const client = newClient();
  const account = newAccount();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let started = 0;
  chain.readPolicyStatus = async () => {
    started += 1;
    await gate;
    return policyRead("not-installed", 120);
  };
  const options = { queryKey: queryKeys.policy(account), staleTime: 0, queryFn: () => fetchPolicyGuarded(client, account) };

  const first = client.fetchQuery(options);
  await flush();
  const second = client.fetchQuery(options);
  await flush();
  release();
  const [a, b] = await Promise.all([first, second]);

  assert.equal(started, 1, "one read served both callers");
  assert.equal(a, b);
});

test("an in-flight read from before a confirmed transaction cannot overwrite its outcome", async () => {
  const client = newClient();
  const account = newAccount();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let reads = 0;
  // The first read began before the transaction and is still out; whatever
  // asks after it sees the chain at the transaction's ledger.
  chain.readPolicyStatus = async () => {
    reads += 1;
    if (reads === 1) {
      await gate;
      return policyRead("not-installed", 90);
    }
    return { status: { kind: "installed", contextRuleId: 5, chain: true }, ledger: 100 };
  };
  const inFlight = client
    .fetchQuery({ queryKey: queryKeys.policy(account), staleTime: 0, queryFn: () => fetchPolicyGuarded(client, account) })
    .catch(() => undefined);
  await flush();

  const optimistic = { kind: "installed", contextRuleId: 5, provisional: true };
  await applyConfirmedPolicy(client, account, 100, optimistic);
  assert.equal(client.getQueryData(queryKeys.policy(account)), optimistic);

  // The stale read lands now, below the floor the transaction raised.
  release();
  await inFlight;
  await advance(5_000);

  const stored = client.getQueryData(queryKeys.policy(account));
  assert.notEqual(stored.kind, "not-installed", "the pre-transaction read did not undo the install");
});

// ---- reconcile -------------------------------------------------------------

test("reconcile replaces the optimistic value once a read meets the floor", async () => {
  const client = newClient();
  const account = newAccount();
  const optimistic = { kind: "installed", contextRuleId: 5, provisional: true };
  const chainStatus = { kind: "installed", contextRuleId: 5 };
  chain.readPolicyStatus = scripted([
    { status: { kind: "not-installed", reason: "no-rule" }, ledger: 90 },
    { status: chainStatus, ledger: 101 },
  ]);

  await applyConfirmedPolicy(client, account, 100, optimistic);
  assert.equal(client.getQueryData(queryKeys.policy(account)), optimistic, "the outcome is on screen at once");

  // The first read is behind the floor and is held; the cache keeps the optimistic value.
  await advance(1_100);
  assert.equal(client.getQueryData(queryKeys.policy(account)), optimistic);
  assert.equal(chain.readPolicyStatus.calls(), 1);

  // The next read is at the floor and replaces it.
  await advance(1_000);
  assert.deepEqual(client.getQueryData(queryKeys.policy(account)), chainStatus);
  assert.equal(client.getQueryData(queryKeys.policy(account)).provisional, undefined, "the provisional marker is gone");
  assert.equal(floorOf(client, account).met.policy, true);

  // And the loop has ended.
  const calls = chain.readPolicyStatus.calls();
  await advance(5_000);
  assert.equal(chain.readPolicyStatus.calls(), calls);
});

test("reconcile that never reaches the floor leaves the existing value and stops", async () => {
  const client = newClient();
  const account = newAccount();
  const optimistic = { kind: "installed", contextRuleId: 5, provisional: true };
  chain.readPolicyStatus = scripted([policyRead("not-installed", 90)]);

  await applyConfirmedPolicy(client, account, 100, optimistic);
  await advance(35_000);

  assert.equal(client.getQueryData(queryKeys.policy(account)), optimistic, "the stale reads did not clobber it");
  assert.notEqual(floorOf(client, account).met.policy, true);

  const calls = chain.readPolicyStatus.calls();
  assert.ok(calls > 0 && calls <= 31, `bounded reads (${calls})`);
  await advance(10_000);
  assert.equal(chain.readPolicyStatus.calls(), calls, "no reads after the reconcile window");
});

test("a reconcile for the same reader and account is not started twice", async () => {
  const client = newClient();
  const account = newAccount();
  raiseAccountFloor(client, account, 100);
  const read = scripted([reading("v", 90)]);
  const guarded = () => read().then((r) => r.value);

  const first = reconcileAtFloor(client, account, "balances", queryKeys.balances(account), guarded);
  const second = reconcileAtFloor(client, account, "balances", queryKeys.balances(account), guarded);
  await advance(2_500);

  assert.ok(read.calls() <= 3, `one loop, one read per turn (${read.calls()})`);
  await advance(35_000);
  await Promise.all([first, second]);
});
