// Controlled asynchronous checks for src/lib/ownedDrafts.ts (per-account local drafts). No React Native needed.
// Run from the repository root after npm ci:  node apps/user-mobile/tests/ownedDrafts.async.check.cjs
// user-mobile has no test runner, so this is a plain Node script; it exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "ownedDrafts.ts"), "utf8");
const JS = ts.transpileModule(SRC, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
const tick = () => new Promise((r) => setImmediate(r));

class FakeStorage {
  constructor(store) { this.store = store; this.pending = []; this.manual = false; this.failNextSet = false; }
  _op(name, fn) {
    return new Promise((resolve, reject) => {
      const job = () => { try { resolve(fn()); } catch (e) { reject(e); } };
      if (this.manual) this.pending.push({ name, job }); else setImmediate(job);
    });
  }
  getItem(k) {
    if (k === MARK_KEY && this.failMarkerRead > 0) { this.failMarkerRead--; return this._op(`get ${k} (fails)`, () => { throw new Error("read io"); }); }
    return this._op(`get ${k}`, () => (this.store.has(k) ? this.store.get(k) : null));
  }
  getAllKeys() { return this._op("getAllKeys", () => [...this.store.keys()]); }
  setItem(k, v) {
    if (this.failNextSet) { this.failNextSet = false; return this._op(`set ${k} (fails)`, () => { throw new Error("disk full"); }); }
    return this._op(`set ${k}`, () => { this.store.set(k, v); });
  }
  removeItem(k) { return this._op(`remove ${k}`, () => { this.store.delete(k); }); }
  multiRemove(ks) {
    if (this.failMultiRemove > 0) { this.failMultiRemove--; return this._op(`multiRemove (fails)`, () => { throw new Error("io error"); }); }
    return this._op(`multiRemove`, () => ks.forEach((k) => this.store.delete(k)));
  }
  names() { return this.pending.map((p) => p.name); }
  async complete(i = 0) { const [p] = this.pending.splice(i, 1); assert.ok(p, "no pending op"); (this.log ||= []).push(p.name); p.job(); await tick(); await tick(); }
  async drain() { while (this.pending.length) await this.complete(0); await tick(); }
  crash() { this.pending = []; } // the process dies: queued native work never runs
  /** Completes pending native calls one by one until `pred()` holds (waits a tick first so queued work has started). */
  async until(pred) { await tick(); for (let n = 0; n < 50 && !pred(); n++) await this.complete(0); assert.ok(pred(), "condition never reached"); }
}
const MARK_KEY = "fynrox.draft.v2.pendingClear";

/** Loads a fresh module instance (a fresh "process") over the given storage. */
function load(storage) {
  const mod = { exports: {} };
  const req = (n) => (n === "@react-native-async-storage/async-storage" ? { __esModule: true, default: storage } : require(n));
  new Function("require", "module", "exports", JS)(req, mod, mod.exports);
  return mod.exports;
}

/** The rejected design: owner check before the write, no queue, no marker. */
function loadNaive(storage) {
  let active = null; const epoch = new Map(); const e = (u) => epoch.get(u) ?? 0; const key = (u) => "fynrox.draft.v2.meal:" + u;
  return {
    setActiveDraftUser: (u) => { active = u; },
    draftOwner: (u) => ({ userId: u, epoch: e(u) }),
    async writeOwnedDraft(_k, o, data) { if (e(o.userId) !== o.epoch) return false; await storage.setItem(key(o.userId), JSON.stringify({ v: 2, userId: o.userId, data })); return true; },
    async clearDraftsForSignOut(u) { epoch.set(u, e(u) + 1); await storage.multiRemove([key(u)]); },
  };
}

const MEAL = (u) => "fynrox.draft.v2.meal:" + u;
const AI = (u) => "fynrox.draft.v2.aiCoach:" + u;
const draft = { name: "Dal rice", calories: "520" };
const results = [];
// A check awaiting a promise that never settles would otherwise end the process silently with exit code 0.
let finished = false;
process.on("exit", () => { if (!finished) { console.error("INCOMPLETE: a check never finished"); process.exitCode = 1; } });
async function t(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (e) { results.push(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

(async () => {
  await t("T0 contrast: naive pre-write check LETS an in-flight write undo logout cleanup", async () => {
    const s = new FakeStorage(new Map()); const d = loadNaive(s); d.setActiveDraftUser("A");
    s.manual = true;
    const owner = d.draftOwner("A");
    const w = d.writeOwnedDraft("meal", owner, draft);          // passes its pre-check, setItem now in flight
    await tick();
    const c = d.clearDraftsForSignOut("A");                     // cleanup issued while the write is in flight
    await tick();
    assert.deepStrictEqual(s.names(), [`set ${MEAL("A")}`, "multiRemove"]);
    await s.complete(1);                                        // native cleanup finishes first...
    await s.complete(0);                                        // ...then the in-flight write lands
    await Promise.all([w, c]);
    assert.ok(s.store.has(MEAL("A")), "expected the naive design to leave A's draft behind (the bug)");
  });

  // T1, T3 and T7 run after initDrafts(), as the app's start-up does. Intentional change (B2 marker-first contract):
  // a process that has not read the pending-clear marker first reads it before its first draft operation, so the
  // exact native-call sequences below hold only after initialisation. The same safety claims WITHOUT initDrafts are
  // checked by T1-core / T3-core / T7-core further down (no call-order assertions).
  await t("T1 write completing AFTER logout cleanup was requested cannot resurrect the draft", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); await d.initDrafts(); d.setActiveDraftUser("A");
    s.manual = true;
    const owner = d.draftOwner("A");
    const w = d.writeOwnedDraft("meal", owner, draft); await tick();
    const c = d.clearDraftsForSignOut("A"); await tick();
    // Only the write is issued to native storage; the cleanup waits in the JS queue behind it.
    assert.deepStrictEqual(s.names(), [`set ${MEAL("A")}`]);
    await s.drain(); await Promise.all([w, c]);
    assert.ok(!s.store.has(MEAL("A")), "A's draft must be gone");
    assert.ok(!s.store.has("fynrox.draft.v2.pendingClear"), "marker removed after a completed cleanup");
  });

  await t("T2 write REQUESTED after cleanup is dropped without touching storage", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A");
    const owner = d.draftOwner("A");
    await d.clearDraftsForSignOut("A");
    s.manual = true;
    const ok = d.writeOwnedDraft("meal", owner, draft); await tick(); await tick();
    assert.deepStrictEqual(s.names(), [], "no native write issued");
    assert.strictEqual(await ok, false);
    assert.ok(!s.store.has(MEAL("A")));
  });

  await t("T3 account switch DURING a read returns nothing", async () => {
    const store = new Map([[MEAL("A"), JSON.stringify({ v: 2, userId: "A", data: draft })]]);
    const s = new FakeStorage(store); const d = load(s); await d.initDrafts(); d.setActiveDraftUser("A");
    s.manual = true;
    const r = d.readOwnedDraft("meal", d.draftOwner("A")); await tick();
    assert.deepStrictEqual(s.names(), [`get ${MEAL("A")}`]);
    d.setActiveDraftUser("B");                                   // switch while getItem is in flight
    await s.drain();
    assert.strictEqual(await r, null);
  });

  await t("T4 account switch DURING a write (explicit sign-out): A removed, B unaffected", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A");
    s.manual = true;
    const wA = d.writeOwnedDraft("meal", d.draftOwner("A"), draft); await tick();
    const c = d.clearDraftsForSignOut("A");
    d.setActiveDraftUser("B");
    const wB = d.writeOwnedDraft("meal", d.draftOwner("B"), { name: "Poha", calories: "250" });
    await s.drain(); await Promise.all([wA, c, wB]);
    assert.ok(!s.store.has(MEAL("A")));
    s.manual = false;
    assert.deepStrictEqual(await d.readOwnedDraft("meal", d.draftOwner("B")), { name: "Poha", calories: "250" });
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null);
  });

  await t("T5 failed request completing under a DIFFERENT account (after A's explicit sign-out) writes nothing", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A");
    const ownerAtStart = d.draftOwner("A");                      // LogMeal captures this before awaiting the API
    await d.clearDraftsForSignOut("A");                          // A signs out while the request is pending
    d.setActiveDraftUser("B");                                   // B signs in
    const wrote = await d.writeOwnedDraft("meal", ownerAtStart, draft); // the failed request's catch finally runs
    assert.strictEqual(wrote, false);
    assert.ok(!s.store.has(MEAL("A")) && !s.store.has(MEAL("B")));
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("B")), null);
  });

  await t("T5b same, but A's session only EXPIRED: the write lands owner-only; B sees nothing; A gets it back", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A");
    const ownerAtStart = d.draftOwner("A");
    d.setActiveDraftUser(null);                                  // expiry: signed out locally, nothing cleared
    d.setActiveDraftUser("B");
    assert.strictEqual(await d.writeOwnedDraft("meal", ownerAtStart, draft), true);
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("B")), null);
    d.setActiveDraftUser("A");                                   // same user signs in again
    assert.deepStrictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), draft);
  });

  await t("T6a account deletion confirmed: drafts cleared", async () => {
    const store = new Map([[MEAL("A"), "x"], [AI("A"), "y"]]);
    const s = new FakeStorage(store); const d = load(s); d.setActiveDraftUser("A");
    const deleteAccount = async (serverOk) => { if (!serverOk) throw new Error("network"); await d.clearDraftsForSignOut("A"); };
    await deleteAccount(true);
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("A")));
  });

  await t("T6b account deletion FAILED: drafts kept", async () => {
    const store = new Map([[MEAL("A"), JSON.stringify({ v: 2, userId: "A", data: draft })]]);
    const s = new FakeStorage(store); const d = load(s); d.setActiveDraftUser("A");
    const deleteAccount = async (serverOk) => { if (!serverOk) throw new Error("network"); await d.clearDraftsForSignOut("A"); };
    await assert.rejects(deleteAccount(false));
    assert.deepStrictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), draft);
  });

  await t("T7 app killed DURING cleanup (marker saved, drafts not yet removed): next start finishes it", async () => {
    const store = new Map([[MEAL("A"), "x"], [AI("A"), "y"]]);
    const s1 = new FakeStorage(store); const d1 = load(s1); await d1.initDrafts(); d1.setActiveDraftUser("A");
    s1.manual = true;
    d1.clearDraftsForSignOut("A"); await tick();
    await s1.complete(0);                                        // get pendingClear
    await s1.complete(0);                                        // set pendingClear  (marker persisted)
    assert.ok(store.has("fynrox.draft.v2.pendingClear"));
    s1.crash();                                                  // killed before multiRemove ran
    assert.ok(store.has(MEAL("A")), "drafts still on disk at the moment of the crash");
    const s2 = new FakeStorage(store); const d2 = load(s2);      // fresh process
    await d2.initDrafts();
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("A")) && !store.has("fynrox.draft.v2.pendingClear"));
    d2.setActiveDraftUser("B");
    assert.strictEqual(await d2.readOwnedDraft("meal", d2.draftOwner("A")), null);
  });

  await t("T7b app killed BEFORE the marker was saved: nothing cleared, drafts remain owner-only", async () => {
    // In AuthContext the cleanup is awaited before tokens are cleared, so this crash leaves A still signed in.
    const store = new Map([[MEAL("A"), JSON.stringify({ v: 2, userId: "A", data: draft })]]);
    const s1 = new FakeStorage(store); const d1 = load(s1); d1.setActiveDraftUser("A");
    s1.manual = true; d1.clearDraftsForSignOut("A"); await tick(); s1.crash();
    const d2 = load(new FakeStorage(store)); await d2.initDrafts();
    d2.setActiveDraftUser("B");
    assert.strictEqual(await d2.readOwnedDraft("meal", d2.draftOwner("B")), null, "B never sees it");
    d2.setActiveDraftUser("A");
    assert.deepStrictEqual(await d2.readOwnedDraft("meal", d2.draftOwner("A")), draft);
  });

  await t("T8 ambiguous AI send: retry reuses the SAME owner-scoped clientId; server keeps one message", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A");
    const server = new Map(); // key userId|clientId -> message (mirrors @@unique([userId, clientId]))
    const post = (userId, text, clientId, loseResponse) => {
      if (!server.has(`${userId}|${clientId}`)) server.set(`${userId}|${clientId}`, text);
      if (loseResponse) throw new Error("timeout"); // request reached the server, response lost
    };
    // first attempt: request stored server-side, response lost -> screen keeps the draft with its clientId
    const owner = d.draftOwner("A"); const clientId = "cid-1";
    try { post("A", "Knee pain on squats?", clientId, true); }
    catch { await d.writeOwnedDraft("aiCoach", owner, { text: "Knee pain on squats?", clientId, savedAt: "t" }); }
    // retry by the same owner: restored draft supplies the same clientId
    const restored = await d.readOwnedDraft("aiCoach", d.draftOwner("A"));
    post("A", restored.text, restored.clientId, false);
    await d.clearOwnedDraft("aiCoach", owner);
    assert.strictEqual([...server.keys()].filter((k) => k.startsWith("A|")).length, 1);
    // another account can never obtain A's clientId
    d.setActiveDraftUser("B");
    assert.strictEqual(await d.readOwnedDraft("aiCoach", d.draftOwner("A")), null);
  });

  await t("T9 legacy ownerless drafts are deleted at start-up, never restored", async () => {
    const store = new Map([["logMeal.draft.v1", "{\"name\":\"x\"}"], ["primefit.aiCoach.draft", "{\"text\":\"y\"}"]]);
    const d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("A");
    assert.strictEqual(store.size, 0);
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null);
  });

  await t("T10 a failing storage write does not block the queue", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A");
    s.failNextSet = true;
    assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("A"), draft), false);
    assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("A"), draft), true);
  });

  const MARK = "fynrox.draft.v2.pendingClear";
  const rec = (u, data) => JSON.stringify({ v: 2, userId: u, data });

  await t("T11 storage removal FAILS during logout: sign-out not blocked, not reported as cleared, never exposed, retried at start-up", async () => {
    const store = new Map([[MEAL("A"), rec("A", draft)], [AI("A"), rec("A", { text: "q", clientId: "c", savedAt: "t" })]]);
    const s = new FakeStorage(store); const d = load(s); d.setActiveDraftUser("A");
    s.failMultiRemove = 1;
    const cleared = await d.clearDraftsForSignOut("A");        // resolves; does not throw or hang
    assert.strictEqual(cleared, false, "must not claim the drafts were removed");
    assert.ok(store.has(MARK), "marker kept for retry");
    assert.ok(store.has(MEAL("A")), "data really still on disk");
    d.setActiveDraftUser("B");
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null);
    d.setActiveDraftUser("A");                                   // same user signs in again in the same process
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null, "old drafts unreadable until cleanup succeeds");
    const d2 = load(new FakeStorage(store)); await d2.initDrafts(); // next start-up retries
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("A")) && !store.has(MARK));
  });

  await t("T12 marker write FAILS but removal succeeds: drafts removed, reported cleared", async () => {
    const store = new Map([[MEAL("A"), rec("A", draft)]]);
    const s = new FakeStorage(store); const d = load(s); d.setActiveDraftUser("A");
    s.failNextSet = true;
    assert.strictEqual(await d.clearDraftsForSignOut("A"), true);
    assert.ok(!store.has(MEAL("A")) && !store.has(MARK));
  });

  await t("T13 start-up cleanup FAILS again: user not trapped; a new draft replaces the old ones and survives the next start", async () => {
    const store = new Map([[MARK, JSON.stringify(["A"])], [MEAL("A"), rec("A", draft)], [AI("A"), rec("A", { text: "old", clientId: "c0", savedAt: "t" })]]);
    const s = new FakeStorage(store); const d = load(s);
    s.failMultiRemove = 1; await d.initDrafts();               // retry fails
    assert.ok(store.has(MARK));
    d.setActiveDraftUser("A");
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null, "old meal draft not shown");
    assert.strictEqual(await d.readOwnedDraft("aiCoach", d.draftOwner("A")), null, "old AI draft not shown");
    const fresh = { name: "Idli", calories: "300" };
    assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("A"), fresh), true, "user can keep working");
    assert.ok(!store.has(AI("A")), "the other old draft was removed");
    assert.ok(!store.has(MARK) || !JSON.parse(store.get(MARK)).includes("A"), "A taken off the marker");
    assert.deepStrictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), fresh);
    const d2 = load(new FakeStorage(store)); await d2.initDrafts(); d2.setActiveDraftUser("A");
    assert.deepStrictEqual(await d2.readOwnedDraft("meal", d2.draftOwner("A")), fresh, "the new draft survives the next start");
  });

  await t("T14 every storage call failing during logout still resolves promptly (no trap)", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A");
    s.failNextSet = true; s.failMultiRemove = 5;
    const r = await Promise.race([d.clearDraftsForSignOut("A"), new Promise((res) => setTimeout(() => res("timeout"), 1000))]);
    assert.strictEqual(r, false);
  });

  const race = (p, ms) => Promise.race([p.then((v) => ({ settled: true, v })), new Promise((r) => setTimeout(() => r({ settled: false }), ms))]);
  const interrupted = () => new Map([[MARK, JSON.stringify(["A"])], [MEAL("A"), rec("A", { old: "meal" })], [AI("A"), rec("A", { old: "ai" })]]);

  await t("H1 a storage call that REJECTS during sign-out cleanup: cleanup still resolves (false)", async () => {
    const s = new FakeStorage(new Map([[MEAL("A"), rec("A", 1)]])); const d = load(s); d.setActiveDraftUser("A"); s.failMultiRemove = 1;
    const r = await race(d.clearDraftsForSignOut("A"), 500); assert.ok(r.settled && r.v === false);
  });

  await t("R1 interrupted cleanup, start-up retry succeeds: new meal and new AI drafts saved independently survive restart", async () => {
    const store = interrupted(); let d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("A");
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("A")) && !store.has(MARK));
    assert.ok(await d.writeOwnedDraft("meal", d.draftOwner("A"), { m: 1 })); assert.ok(await d.writeOwnedDraft("aiCoach", d.draftOwner("A"), { a: 1 }));
    d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("A");
    assert.deepStrictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), { m: 1 }); assert.deepStrictEqual(await d.readOwnedDraft("aiCoach", d.draftOwner("A")), { a: 1 });
  });

  await t("R2 start-up retry fails: new meal first removes only the old AI draft; a later new AI draft keeps the new meal", async () => {
    const store = interrupted(); const s = new FakeStorage(store); let d = load(s); s.failMultiRemove = 1; await d.initDrafts(); d.setActiveDraftUser("A");
    assert.ok(await d.writeOwnedDraft("meal", d.draftOwner("A"), { m: "new" })); assert.ok(!store.has(AI("A")));
    assert.ok(await d.writeOwnedDraft("aiCoach", d.draftOwner("A"), { a: "new" })); assert.ok(store.has(MEAL("A")));
    d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("A");
    assert.deepStrictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), { m: "new" }); assert.deepStrictEqual(await d.readOwnedDraft("aiCoach", d.draftOwner("A")), { a: "new" });
  });

  await t("R3 start-up retry fails, AI draft first: removes only the old meal; a later new meal keeps the new AI draft", async () => {
    const store = interrupted(); const s = new FakeStorage(store); const d = load(s); s.failMultiRemove = 1; await d.initDrafts(); d.setActiveDraftUser("A");
    assert.ok(await d.writeOwnedDraft("aiCoach", d.draftOwner("A"), { a: "new" })); assert.ok(!store.has(MEAL("A")));
    assert.ok(await d.writeOwnedDraft("meal", d.draftOwner("A"), { m: "new" })); assert.ok(store.has(AI("A")));
  });

  // ---- H2: a storage call that NEVER settles during sign-out (manual storage, ops left pending = hung)
  await t("H2a storage never answers: unbounded cleanup stays pending, bounded sign-out wait resolves false (not confirmed) and sign-out continues", async () => {
    const s = new FakeStorage(new Map([[MEAL("A"), rec("A", draft)]])); const d = load(s); d.setActiveDraftUser("A"); s.manual = true;
    const unbounded = race(d.clearDraftsForSignOut("A"), 150);
    const started = Date.now(); const signOut = [];
    const logout = (async () => { signOut.push(await d.clearDraftsForSignOutWithin("A", 50)); signOut.push("tokens cleared"); })();
    const r = await race(logout, 1000);
    assert.ok(r.settled, "sign-out must continue after the bounded wait");
    assert.deepStrictEqual(signOut, [false, "tokens cleared"], "timeout reports cleanup as not confirmed");
    assert.ok(Date.now() - started < 500);
    assert.strictEqual((await unbounded).settled, false, "the unbounded call itself still waits on storage (documented)");
    assert.ok(s.store.has(MEAL("A")), "nothing was claimed removed: the draft is still on disk while storage is hung");
  });

  await t("H2b during the hang: old drafts unreadable (other account and same account again); an old-owner write requested later is dropped", async () => {
    const s = new FakeStorage(new Map([[MEAL("A"), rec("A", draft)]])); const d = load(s); d.setActiveDraftUser("A");
    const oldOwner = d.draftOwner("A"); s.manual = true;
    assert.strictEqual(await d.clearDraftsForSignOutWithin("A", 30), false);
    d.setActiveDraftUser("B");
    const rB = race(d.readOwnedDraft("meal", oldOwner), 100);
    const lateWrite = d.writeOwnedDraft("meal", oldOwner, { name: "late" });
    d.setActiveDraftUser("A");                                  // A signs in again in the same process
    const rA = d.readOwnedDraft("meal", d.draftOwner("A"));
    const b = await rB; assert.ok(!b.settled || b.v === null, "B never sees A's draft");
    s.manual = false; await s.drain(); await tick();            // storage recovers; the queue runs in order
    assert.strictEqual(await lateWrite, false, "write requested after sign-out dropped");
    assert.strictEqual(await rA, null, "A's old draft not returned, even to A");
    assert.ok(!s.store.has(MEAL("A")), "the queued cleanup ran once storage answered (it was not cancelled)");
  });

  await t("H2c a timeout cancels nothing and keeps ordering: the queued cleanup runs before later work when storage answers", async () => {
    const s = new FakeStorage(new Map([[MEAL("A"), rec("A", draft)], [AI("A"), rec("A", { text: "x", clientId: "c", savedAt: "t" })]])); const d = load(s);
    d.setActiveDraftUser("A"); s.manual = true;
    assert.strictEqual(await d.clearDraftsForSignOutWithin("A", 30), false);
    d.setActiveDraftUser("B");
    const wB = d.writeOwnedDraft("meal", d.draftOwner("B"), { name: "B meal" });
    await s.drain(); await tick();
    assert.strictEqual(await wB, true);
    const iRemove = s.log.indexOf("multiRemove"), iSetB = s.log.indexOf(`set ${MEAL("B")}`);
    assert.ok(iRemove >= 0 && iSetB > iRemove, `A's cleanup ran first: ${s.log.join(" | ")}`);
    assert.ok(!s.store.has(MEAL("A")) && !s.store.has(AI("A")) && !s.store.has(MARK), "A's drafts and marker cleared late");
    s.manual = false;
    assert.deepStrictEqual(await d.readOwnedDraft("meal", d.draftOwner("B")), { name: "B meal" });
  });

  await t("H2d storage hung for the rest of the process: later draft operations for any account wait; the next sign-out is bounded again", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A"); s.manual = true;
    assert.strictEqual(await d.clearDraftsForSignOutWithin("A", 30), false);
    d.setActiveDraftUser("B");
    const ops = await Promise.all([
      race(d.readOwnedDraft("meal", d.draftOwner("B")), 100),
      race(d.writeOwnedDraft("meal", d.draftOwner("B"), draft), 100),
      race(d.clearOwnedDraft("meal", d.draftOwner("B")), 100),
    ]);
    assert.deepStrictEqual(ops.map((o) => o.settled), [false, false, false], "documented: they wait behind the hung call");
    const r = await race(d.clearDraftsForSignOutWithin("B", 30), 500);
    assert.ok(r.settled && r.v === false, "B's sign-out still continues");
    const d2 = load(new FakeStorage(s.store)); await d2.initDrafts(); d2.setActiveDraftUser("B");  // restart: fresh queue
    assert.strictEqual(await d2.readOwnedDraft("meal", d2.draftOwner("B")), null, "nothing was persisted");
  });

  await t("H2e storage answering in time: bounded wait resolves true", async () => {
    const s = new FakeStorage(new Map([[MEAL("A"), rec("A", draft)]])); const d = load(s); d.setActiveDraftUser("A");
    assert.strictEqual(await d.clearDraftsForSignOutWithin("A", 1000), true);
    assert.ok(!s.store.has(MEAL("A")) && !s.store.has(MARK));
  });

  // ---- R4: cleanup is completed (both old drafts, then the marker) BEFORE a new draft is persisted
  await t("R4a marker update fails on the first new save: nothing persisted (false), so a restart cannot delete a saved draft; next save works and survives restart", async () => {
    const store = interrupted(); const s = new FakeStorage(store); let d = load(s); s.failMultiRemove = 1; await d.initDrafts(); d.setActiveDraftUser("A");
    s.failNextSet = true;                                       // the marker update (setItem) fails
    store.set(MARK, JSON.stringify(["A", "C"]));                // another account also pending, so the update is a set
    assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("A"), { m: "new" }), false, "reported not saved");
    assert.ok(!store.has(MEAL("A")), "the new draft was not persisted");
    assert.strictEqual(await d.readOwnedDraft("aiCoach", d.draftOwner("A")), null, "old AI draft still hidden");
    assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("A"), { m: "retry" }), true);
    assert.deepStrictEqual(JSON.parse(store.get(MARK)), ["C"], "A off the marker; the other account kept");
    d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("A");
    assert.deepStrictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), { m: "retry" }, "persisted draft survives restart");
    assert.strictEqual(await d.readOwnedDraft("aiCoach", d.draftOwner("A")), null, "old AI draft gone");
  });

  await t("R4b old-draft removal fails on the first new save: nothing persisted; marker kept; restart retry still works", async () => {
    const store = interrupted(); const s = new FakeStorage(store); let d = load(s); s.failMultiRemove = 1; await d.initDrafts(); d.setActiveDraftUser("A");
    s.failMultiRemove = 1;                                      // the save's removal of the old drafts fails
    assert.strictEqual(await d.writeOwnedDraft("aiCoach", d.draftOwner("A"), { a: "new" }), false);
    assert.deepStrictEqual(JSON.parse(store.get(AI("A"))).data, { old: "ai" }, "new draft not written over the old one");
    assert.deepStrictEqual(JSON.parse(store.get(MARK)), ["A"]);
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null);
    d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("A");
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("A")) && !store.has(MARK), "restart finished the cleanup");
  });

  await t("R4c sign-out requested while cleanup-before-save runs: nothing persisted; drafts stay unreadable; the sign-out cleanup runs next", async () => {
    const store = interrupted(); const s = new FakeStorage(store); const d = load(s); s.failMultiRemove = 1; await d.initDrafts(); d.setActiveDraftUser("A");
    s.manual = true;
    const w = d.writeOwnedDraft("meal", d.draftOwner("A"), { m: "new" });
    await tick();
    assert.deepStrictEqual(s.names(), ["multiRemove"], "write is completing the old cleanup");
    const c = d.clearDraftsForSignOut("A");
    await s.drain(); await tick();
    assert.strictEqual(await w, false, "not saved");
    assert.strictEqual(await c, true);
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("A")) && !store.has(MARK));
    s.manual = false; d.setActiveDraftUser("A");
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null);
  });

  await t("R4d independence after recovery: new meal and new AI drafts each survive restart, saved in either order", async () => {
    for (const order of [["meal", "aiCoach"], ["aiCoach", "meal"]]) {
      const store = interrupted(); const s = new FakeStorage(store); let d = load(s); s.failMultiRemove = 1; await d.initDrafts(); d.setActiveDraftUser("A");
      for (const k of order) assert.strictEqual(await d.writeOwnedDraft(k, d.draftOwner("A"), { k }), true);
      d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("A");
      for (const k of order) assert.deepStrictEqual(await d.readOwnedDraft(k, d.draftOwner("A")), { k }, `${order.join("→")}: ${k} kept`);
    }
  });

  // ---- B2 marker-first contract: no-init safety (core claims of T1/T3/T7, no call-order assertions)
  await t("T1-core no initDrafts: a write completing after logout cleanup was requested cannot resurrect the draft", async () => {
    const s = new FakeStorage(new Map()); const d = load(s); d.setActiveDraftUser("A"); s.manual = true;
    const w = d.writeOwnedDraft("meal", d.draftOwner("A"), draft); await tick();
    const c = d.clearDraftsForSignOut("A"); await tick();
    await s.until(() => !s.pending.length); await s.drain(); await Promise.all([w, c]);
    assert.ok(!s.store.has(MEAL("A")), "A's draft must be gone"); assert.ok(!s.store.has(MARK), "marker removed");
  });

  await t("T3-core no initDrafts: account switch while the DRAFT read is in flight returns nothing", async () => {
    const s = new FakeStorage(new Map([[MEAL("A"), rec("A", draft)]])); const d = load(s); d.setActiveDraftUser("A"); s.manual = true;
    const r = d.readOwnedDraft("meal", d.draftOwner("A"));
    await s.until(() => s.names().includes(`get ${MEAL("A")}`));
    d.setActiveDraftUser("B");
    await s.drain();
    assert.strictEqual(await r, null);
  });

  await t("T7-core no initDrafts in the first run: killed after the marker is saved, before removal; next start finishes it", async () => {
    const store = new Map([[MEAL("A"), "x"], [AI("A"), "y"]]);
    const s1 = new FakeStorage(store); const d1 = load(s1); d1.setActiveDraftUser("A"); s1.manual = true;
    d1.clearDraftsForSignOut("A");
    await s1.until(() => store.has(MARK));
    s1.crash();
    assert.ok(store.has(MEAL("A")), "drafts still on disk at the crash");
    const d2 = load(new FakeStorage(store)); await d2.initDrafts();
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("A")) && !store.has(MARK));
    d2.setActiveDraftUser("B"); assert.strictEqual(await d2.readOwnedDraft("meal", d2.draftOwner("A")), null);
  });

  // ---- requests before initialisation completes; failed/repeated initialisation; account switching during init
  const markerOf = (store) => (store.has(MARK) ? JSON.parse(store.get(MARK)) : []);
  await t("I1 read/write requested while initDrafts runs wait for it: a pending user's old draft is never returned; the new draft lands after the cleanup and survives restart", async () => {
    const store = new Map([[MARK, JSON.stringify(["A"])], [MEAL("A"), rec("A", "old")]]);
    const s = new FakeStorage(store); const d = load(s); s.manual = true;
    const init = d.initDrafts(); d.setActiveDraftUser("A");
    const rA = d.readOwnedDraft("meal", d.draftOwner("A"));
    const wA = d.writeOwnedDraft("meal", d.draftOwner("A"), "new");
    await s.until(() => !s.pending.length); await s.drain(); await init;
    assert.strictEqual(await rA, null); assert.strictEqual(await wA, true);
    assert.ok(s.log.indexOf("multiRemove") < s.log.indexOf(`set ${MEAL("A")}`), `cleanup ran before the new save: ${s.log.join(" | ")}`);
    const d2 = load(new FakeStorage(store)); await d2.initDrafts(); d2.setActiveDraftUser("A");
    assert.strictEqual(await d2.readOwnedDraft("meal", d2.draftOwner("A")), "new");
  });

  await t("I1b a user NOT in the marker gets their own draft once initDrafts has finished", async () => {
    const store = new Map([[MARK, JSON.stringify(["A"])], [MEAL("A"), rec("A", "old")], [MEAL("B"), rec("B", "b")]]);
    const s = new FakeStorage(store); const d = load(s); s.manual = true;
    const init = d.initDrafts(); d.setActiveDraftUser("B");
    const rB = d.readOwnedDraft("meal", d.draftOwner("B"));
    await s.until(() => !s.pending.length); await s.drain(); await init;
    assert.strictEqual(await rB, "b");
  });

  await t("I2a the first initDrafts cannot read the marker (marker kept as is); a second initDrafts cleans both pending users", async () => {
    const store = new Map([[MARK, JSON.stringify(["A", "B"])], [MEAL("A"), rec("A", 1)], [AI("B"), rec("B", 2)]]);
    const s = new FakeStorage(store); s.failMarkerRead = 1; const d = load(s);
    await d.initDrafts();
    assert.deepStrictEqual(markerOf(store), ["A", "B"]);
    await d.initDrafts();
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("B")) && !store.has(MARK));
  });

  await t("I2b the first initDrafts' removal fails (drafts hidden meanwhile); a repeated initDrafts finishes the cleanup", async () => {
    const store = new Map([[MARK, JSON.stringify(["A"])], [MEAL("A"), rec("A", 1)]]);
    const s = new FakeStorage(store); s.failMultiRemove = 1; const d = load(s);
    await d.initDrafts();
    d.setActiveDraftUser("A"); assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null);
    await d.initDrafts();
    assert.ok(!store.has(MEAL("A")) && !store.has(MARK));
  });

  await t("I2c initDrafts again after success is harmless: a draft saved in between survives", async () => {
    const store = new Map([[MARK, JSON.stringify(["A"])], [MEAL("A"), rec("A", 1)]]);
    const d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("C");
    assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("C"), "c"), true);
    await d.initDrafts(); await d.initDrafts();
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("C")), "c");
  });

  await t("I3a account switch while initDrafts runs: A's reads return nothing, B's returns B's draft, A's old draft removed", async () => {
    const store = new Map([[MARK, JSON.stringify(["A"])], [MEAL("A"), rec("A", "old")], [MEAL("B"), rec("B", "b")]]);
    const s = new FakeStorage(store); const d = load(s); s.manual = true;
    const init = d.initDrafts();
    d.setActiveDraftUser("A"); const rA = d.readOwnedDraft("meal", d.draftOwner("A"));
    d.setActiveDraftUser("B"); const rB = d.readOwnedDraft("meal", d.draftOwner("B"));
    const rA2 = d.readOwnedDraft("meal", d.draftOwner("A"));
    await s.until(() => !s.pending.length); await s.drain(); await init;
    assert.strictEqual(await rA, null); assert.strictEqual(await rA2, null); assert.strictEqual(await rB, "b");
    assert.ok(!store.has(MEAL("A")));
  });

  await t("I3b A signs out while initDrafts runs: the cleanup runs after init; drafts and marker cleared", async () => {
    const store = new Map([[MEAL("A"), rec("A", "a")], [AI("A"), rec("A", "x")]]);
    const s = new FakeStorage(store); const d = load(s); s.manual = true;
    const init = d.initDrafts(); d.setActiveDraftUser("A");
    const c = d.clearDraftsForSignOut("A"); d.setActiveDraftUser("B");
    await s.until(() => !s.pending.length); await s.drain(); await init;
    assert.strictEqual(await c, true);
    assert.ok(!store.has(MEAL("A")) && !store.has(AI("A")) && !store.has(MARK));
  });

  // ---- marker-read failure and recovery; preservation of pending entries
  await t("M1 two users pending + marker unreadable for a whole run: no write drops A or B; C's save reported not persisted; both obligations met after recovery", async () => {
    const store = new Map([[MARK, JSON.stringify(["A", "B"])], [MEAL("A"), rec("A", "old A")], [AI("A"), rec("A", "old A ai")], [MEAL("B"), rec("B", "old B")]]);
    let s = new FakeStorage(store); s.failMarkerRead = Infinity; let d = load(s);
    const markerWrites = []; const set = s.setItem.bind(s), rm = s.removeItem.bind(s);
    s.setItem = (k, v) => { if (k === MARK) markerWrites.push(v); return set(k, v); };
    s.removeItem = (k) => { if (k === MARK) markerWrites.push(null); return rm(k); };
    await d.initDrafts();
    d.setActiveDraftUser("A"); assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("A")), null);
    d.setActiveDraftUser("C");
    assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("C"), "C meal"), false, "not persisted while the marker is unknown");
    await d.clearDraftsForSignOut("C");
    assert.deepStrictEqual(markerOf(store), ["A", "B"]);
    assert.ok(markerWrites.every((v) => v !== null && JSON.parse(v).includes("A") && JSON.parse(v).includes("B")), `writes: ${JSON.stringify(markerWrites)}`);
    s = new FakeStorage(store); d = load(s); await d.initDrafts();             // next run, storage healthy
    assert.ok(![MEAL("A"), AI("A"), MEAL("B")].some((k) => store.has(k)) && !store.has(MARK));
    d.setActiveDraftUser("C"); assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("C"), "C new"), true);
    d = load(new FakeStorage(store)); await d.initDrafts(); d.setActiveDraftUser("C");
    assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("C")), "C new");
  });

  await t("M2 marker unreadable only at start-up: the next draft operation reads it, cleans A and B, then serves C", async () => {
    const store = new Map([[MARK, JSON.stringify(["A", "B"])], [MEAL("A"), rec("A", 1)], [MEAL("B"), rec("B", 2)], [MEAL("C"), rec("C", 3)]]);
    const s = new FakeStorage(store); s.failMarkerRead = 1; const d = load(s);
    await d.initDrafts();
    d.setActiveDraftUser("C"); assert.strictEqual(await d.readOwnedDraft("meal", d.draftOwner("C")), 3);
    assert.ok(!store.has(MEAL("A")) && !store.has(MEAL("B")) && !store.has(MARK));
  });

  await t("M3 sign-out while the marker is unreadable AND removal fails: marker untouched; the entry is merged by the next successful update and met at restart", async () => {
    const store = new Map([[MARK, JSON.stringify(["B"])], [MEAL("B"), rec("B", 2)], [MEAL("C"), rec("C", 3)]]);
    const s = new FakeStorage(store); const d = load(s); s.failMarkerRead = 3;
    await d.initDrafts();                                                       // marker read 1 fails
    s.failMultiRemove = 1;                                                      // set after init, whose legacy-key removal would use it up
    d.setActiveDraftUser("C"); assert.strictEqual(await d.clearDraftsForSignOut("C"), false); // reads 2-3 fail; removal fails
    assert.deepStrictEqual(markerOf(store), ["B"]); assert.ok(store.has(MEAL("C")));
    d.setActiveDraftUser("D"); await d.writeOwnedDraft("meal", d.draftOwner("D"), "D meal");   // marker readable: B cleaned, C merged
    assert.ok(!store.has(MEAL("B"))); assert.deepStrictEqual(markerOf(store), ["C"]);
    const d2 = load(new FakeStorage(store)); await d2.initDrafts();
    assert.ok(!store.has(MEAL("C")), "C's obligation survived and was met at restart");
  });

  await t("M4 corrupt marker: never treated as empty; ONLY meal/AI Coach drafts and the marker are removed; every unrelated key survives", async () => {
    const unrelated = [
      ["primefit-query-cache", "{\"workouts\":[1]}"], ["fynrox.themeMode", "dark"], ["primefit.setting.largerText", "1"],
      ["primefit.measureUnits.imperial", "0"], ["primefit.pushToken", "t"], ["onboardingWizardDraft", "{}"],
      ["today.brief.dismissedOn", "2026-10-17"], ["search.recent", "[]"], ["primefit.programInsight.p1.2", "1"],
      ["pendingAcquisitionContext", "{}"], ["pendingResetPasswordToken", "x"],
      // near misses: must survive too
      ["fynrox.draft.v2.meal", "no colon"], ["fynrox.draft.v3.meal:A", "other version"], ["fynrox.draft.v2.pendingClear.bak", "x"], ["xfynrox.draft.v2.meal:A", "prefix inside"],
    ];
    const store = new Map([[MARK, "{not json"], [MEAL("A"), rec("A", 1)], [AI("B"), rec("B", 2)], [MEAL("C"), rec("C", 3)], ...unrelated]);
    const d = load(new FakeStorage(store)); await d.initDrafts();
    assert.ok(![MEAL("A"), AI("B"), MEAL("C"), MARK].some((k) => store.has(k)), "drafts and marker removed (trade-off: C's own draft lost; never exposed)");
    for (const [k, v] of unrelated) assert.strictEqual(store.get(k), v, `unrelated key ${k} must survive unchanged`);
    d.setActiveDraftUser("C"); assert.strictEqual(await d.writeOwnedDraft("meal", d.draftOwner("C"), "new"), true, "normal use resumes");
  });

  console.log(results.join("\n"));
  console.log(`${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
  finished = true;
})();
