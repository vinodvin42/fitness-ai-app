// Offline set logging (Figma today/08, 24 Oct 2026). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/offlineSetQueue.check.cjs
// user-mobile has no test runner, so this is a plain Node script; it exits non-zero on any failure.
//   1. unit checks of the real src/lib/offlineSetQueue.ts (queue changes, the overlay on the cached session, parsing);
//   2. replay against an in-memory server that, like the real API, accepts any setNumber and has no idempotency key:
//      order, stable set numbers, server ids swapped in, a lost response, a dropped connection mid-replay, a closed
//      workout, edits and deletes while a set is being sent, another account's items;
//   3. static checks that the screens log, edit and number through the queue (lib/offlineSets.ts).
// The store itself (AsyncStorage, NetInfo) and the screens cannot run in Node; see the phone test list in the notes.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");
const SRC = path.join(__dirname, "..", "src");
const load = (rel) => { const m = { exports: {} }; new Function("module", "exports", "require", ts.transpileModule(fs.readFileSync(path.join(SRC, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText)(m, m.exports, require); return m.exports; };
const Q = load("lib/offlineSetQueue.ts");
const { nextSetNumber, setLogsFor, withSetLog } = load("lib/setNumbering.ts");

const results = []; let failures = 0;
async function t(name, fn) { try { await fn(); results.push(`PASS  ${name}`); } catch (e) { failures++; results.push(`FAIL  ${name}\n      ${e.message.split("\n")[0]}`); } }
const NOW = new Date("2026-10-24T10:00:00Z");
const row = (id, exerciseId, setNumber, extra = {}) => ({ id, exerciseId, setNumber, reps: 8, weightKg: 60, rpe: null, isWarmup: false, isDropSet: false, isFailure: false, note: null, loggedAt: "t", ...extra });
const session = (setLogs = [], extra = {}) => ({ id: "s1", userId: "u1", workoutId: "w1", status: "in_progress", startedAt: "t", completedAt: null, currentExerciseIndex: 0, setLogs, ...extra });
let seq = 0;
const queued = (input, extra = {}) => ({ kind: "set", localId: `local-${++seq}`, userId: "u1", sessionId: "s1", queuedAt: NOW.toISOString(), loggedAt: NOW.toISOString(), input: { reps: 8, weightKg: 60, ...input }, ...extra });
const base = (extra = {}) => ({ userId: "u1", sessionId: "s1", queuedAt: NOW.toISOString(), ...extra });
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const networkError = () => Object.assign(new Error("Network Error"), { isAxiosError: true, request: {} });

(async () => {
  // ---- 1. unit
  await t("U1 local ids: prefixed, distinct, recognised", () => {
    const a = Q.newLocalSetId(NOW.getTime(), 0.1), b = Q.newLocalSetId(NOW.getTime(), 0.2);
    assert.ok(a.startsWith("local-") && Q.isLocalSetId(a));
    assert.notStrictEqual(a, b);
    assert.ok(!Q.isLocalSetId("c1b2-server-uuid"));
  });

  await t("U2 a waiting set shows as a pending row after the server's sets, and the next number counts it", () => {
    const s = session([row("r1", "sq", 1)]);
    const q = Q.enqueueSet(Q.EMPTY_QUEUE, queued({ exerciseId: "sq", setNumber: 2 }));
    const merged = Q.withQueuedChanges(s, Q.itemsFor(q, "u1", "s1"));
    assert.deepStrictEqual(merged.setLogs.map((l) => [l.setNumber, !!l.pending]), [[1, false], [2, true]]);
    assert.strictEqual(nextSetNumber(setLogsFor(merged.setLogs, "sq")), 3);
    assert.strictEqual(Q.waitingSetCount(q, "u1", "s1"), 1);
    assert.strictEqual(s.setLogs.length, 1, "the cached session itself is not changed");
  });

  await t("U3 nothing queued for this session: the same object comes back (no re-render churn)", () => {
    const s = session([row("r1", "sq", 1)]);
    assert.strictEqual(Q.withQueuedChanges(s, []), s);
    const other = Q.enqueueSet(Q.EMPTY_QUEUE, queued({ exerciseId: "sq", setNumber: 2 }, { sessionId: "s2" }));
    assert.strictEqual(Q.withQueuedChanges(s, other.items), s);
    assert.strictEqual(Q.withQueuedChanges(undefined, other.items), undefined);
  });

  await t("U4 editing a waiting set changes its queued item; a cleared weight is removed", () => {
    const item = queued({ exerciseId: "sq", setNumber: 2 });
    let q = Q.enqueueSet(Q.EMPTY_QUEUE, item);
    q = Q.editQueuedSet(q, item.localId, { reps: 10, weightKg: null });
    assert.deepStrictEqual(q.items[0].input, { reps: 10, exerciseId: "sq", setNumber: 2 });
    const merged = Q.withQueuedChanges(session(), q.items);
    assert.strictEqual(merged.setLogs[0].reps, 10);
    assert.strictEqual(merged.setLogs[0].weightKg, null);
    assert.strictEqual(q.items.length, 1, "still one item: nothing extra is sent");
  });

  await t("U5 deleting a waiting set removes it from the queue: nothing is sent for it", () => {
    const item = queued({ exerciseId: "sq", setNumber: 2 });
    const q = Q.removeQueuedSet(Q.enqueueSet(Q.EMPTY_QUEUE, item), item.localId);
    assert.strictEqual(q.items.length, 0);
    assert.strictEqual(Q.waitingSetCount(q, "u1", "s1"), 0);
  });

  await t("U6 a synced set edited offline: edits merge, the row shows them as pending; a delete drops the edit and hides the row", () => {
    let q = Q.queueEdit(Q.EMPTY_QUEUE, base(), "r1", { reps: 9 });
    q = Q.queueEdit(q, base(), "r1", { weightKg: 62.5 });
    assert.strictEqual(q.items.length, 1);
    assert.deepStrictEqual(q.items[0].change, { reps: 9, weightKg: 62.5 });
    const s = session([row("r1", "sq", 1), row("r2", "sq", 2)]);
    const edited = Q.withQueuedChanges(s, q.items).setLogs[0];
    assert.deepStrictEqual([edited.reps, edited.weightKg, edited.pending], [9, 62.5, true]);
    q = Q.queueDelete(q, base(), "r1");
    assert.deepStrictEqual(q.items.map((i) => i.kind), ["delete"]);
    assert.deepStrictEqual(Q.withQueuedChanges(s, q.items).setLogs.map((l) => l.id), ["r2"]);
    assert.strictEqual(Q.queueEdit(q, base(), "r1", { reps: 1 }), q, "an edit after the delete is ignored");
  });

  await t("U7 the exercise index: only the latest is kept, it is laid over the session, and it isn't counted as a set", () => {
    let q = Q.queueProgress(Q.EMPTY_QUEUE, base(), 1);
    q = Q.queueProgress(q, base(), 2);
    assert.deepStrictEqual(q.items.map((i) => i.currentExerciseIndex), [2]);
    assert.strictEqual(Q.withQueuedChanges(session(), q.items).currentExerciseIndex, 2);
    assert.strictEqual(Q.waitingSetCount(q, "u1", "s1"), 0);
    assert.ok(Q.hasQueuedWork(q, "u1", "s1"));
  });

  await t("U8 parseQueue: missing or corrupt storage → empty; bad items and items older than 14 days dropped", () => {
    assert.deepStrictEqual(Q.parseQueue(null, NOW), Q.EMPTY_QUEUE);
    assert.deepStrictEqual(Q.parseQueue("{not json", NOW), Q.EMPTY_QUEUE);
    const good = queued({ exerciseId: "sq", setNumber: 2 });
    const old = queued({ exerciseId: "sq", setNumber: 3 }, { queuedAt: "2026-10-01T00:00:00Z" });
    const raw = JSON.stringify({ items: [good, old, { kind: "set", userId: "u1" }, { kind: "weird", userId: "u1", sessionId: "s1", queuedAt: NOW.toISOString() }], rejected: "nope" });
    const parsed = Q.parseQueue(raw, NOW);
    assert.deepStrictEqual(parsed.items.map((i) => i.localId), [good.localId]);
    assert.deepStrictEqual(parsed.rejected, []);
  });

  await t("U9 classifyFailure: no response → retry; 401/403 → stop; 409 closed, 404, 400 → reject; 5xx → retry", () => {
    assert.strictEqual(Q.classifyFailure(networkError()).kind, "retry");
    assert.strictEqual(Q.classifyFailure(httpError(401)).kind, "stop");
    assert.deepStrictEqual(Q.classifyFailure(httpError(409)), { kind: "reject", reason: "closed" });
    assert.deepStrictEqual(Q.classifyFailure(httpError(404)), { kind: "reject", reason: "not_found" });
    assert.deepStrictEqual(Q.classifyFailure(httpError(400)), { kind: "reject", reason: "invalid" });
    assert.strictEqual(Q.classifyFailure(httpError(503)).kind, "retry");
    assert.ok(Q.isNoResponse(networkError()) && !Q.isNoResponse(httpError(500)));
  });

  await t("U10 settleSentSet: unchanged → dropped; edited while sending → an edit of the server row in its place; deleted while sending → a delete", () => {
    const sent = queued({ exerciseId: "sq", setNumber: 2 });
    const after = queued({ exerciseId: "sq", setNumber: 3 });
    const q = { items: [sent, after], rejected: [] };
    assert.deepStrictEqual(Q.settleSentSet(q, sent, "r9").items.map((i) => i.localId), [after.localId]);
    const edited = Q.editQueuedSet(q, sent.localId, { reps: 5 });
    const e = Q.settleSentSet(edited, sent, "r9").items[0];
    assert.deepStrictEqual([e.kind, e.setId, e.change], ["edit", "r9", { reps: 5 }]);
    const removed = Q.removeQueuedSet(q, sent.localId);
    const d = Q.settleSentSet(removed, sent, "r9").items;
    assert.deepStrictEqual(d.map((i) => i.kind), ["set", "delete"]);
    assert.strictEqual(d[1].setId, "r9");
  });

  // ---- 2. replay against an in-memory server
  function world(rows = [], opts = {}) {
    const server = { rows: rows.slice(), seq: 100, status: opts.status || "in_progress", posts: 0, failPost: null, failGet: null, commitThenFail: false };
    const store = { q: Q.EMPTY_QUEUE };
    const cache = { session: session(rows.map((r) => ({ ...r }))) }; // ["workoutSession", "s1"] as the app last saw it
    const seen = []; // every overlay the screens would have rendered after a write
    const api = {
      fetchSession: async (sid) => { if (server.failGet) { const e = server.failGet; server.failGet = null; throw e; } if (sid !== "s1") throw httpError(404); return { setLogs: server.rows.map((r) => ({ ...r })) }; },
      postSet: async (sid, input) => {
        if (server.failPost) { const e = server.failPost; server.failPost = null; throw e; }
        if (server.status !== "in_progress") throw httpError(409);
        server.posts++;
        const r = row(`r${++server.seq}`, input.exerciseId, input.setNumber, { reps: input.reps, weightKg: input.weightKg ?? null, rpe: input.rpe ?? null, isWarmup: !!input.isWarmup, isDropSet: !!input.isDropSet, isFailure: !!input.isFailure });
        server.rows.push(r);
        if (server.commitThenFail) { server.commitThenFail = false; throw networkError(); } // committed, answer lost
        if (opts.duringPost) opts.duringPost(store, r);
        return r;
      },
      patchSet: async (sid, id, change) => { const r = server.rows.find((x) => x.id === id); if (!r) throw httpError(404); Object.assign(r, change); return r; },
      deleteSet: async (sid, id) => { const before = server.rows.length; server.rows = server.rows.filter((x) => x.id !== id); if (server.rows.length === before) throw httpError(404); return { deleted: true, id }; },
      patchProgress: async (sid, i) => { if (server.status !== "in_progress") throw httpError(409); server.progress = i; },
    };
    const io = {
      userId: "u1",
      read: () => store.q,
      write: (next) => { store.q = next; seen.push(Q.withQueuedChanges(cache.session, Q.itemsFor(store.q, "u1", "s1"))); },
      api,
      onSetSaved: (sid, r) => { cache.session = withSetLog(cache.session, r); },
      now: () => NOW,
    };
    // The screens' offline logging step: number from the overlay, queue with a local id (lib/offlineSets.ts saveSet).
    const logOffline = (exerciseId, extra = {}) => {
      const merged = Q.withQueuedChanges(cache.session, Q.itemsFor(store.q, "u1", "s1"));
      const item = queued({ exerciseId, setNumber: nextSetNumber(setLogsFor(merged.setLogs, exerciseId)), ...extra });
      store.q = Q.enqueueSet(store.q, item);
      return item;
    };
    const overlay = () => Q.withQueuedChanges(cache.session, Q.itemsFor(store.q, "u1", "s1"));
    return { server, store, cache, seen, io, logOffline, overlay };
  }
  const numbers = (rows, ex = "sq") => setLogsFor(rows, ex).map((r) => r.setNumber);
  const noDuplicates = (s) => { const k = s.setLogs.map((l) => `${l.exerciseId}#${l.setNumber}`); return new Set(k).size === k.length; };

  await t("F1 three sets logged offline replay in order with the same numbers; server ids replace the local ones; never shown twice", async () => {
    const w = world([row("r1", "sq", 1)]);
    const a = w.logOffline("sq"), b = w.logOffline("sq", { reps: 6 }), c = w.logOffline("sq", { weightKg: 65 });
    assert.deepStrictEqual([a, b, c].map((i) => i.input.setNumber), [2, 3, 4]);
    const res = await Q.drainQueue(w.io);
    assert.deepStrictEqual([res.sent, res.stopped, res.rejected.length], [3, null, 0]);
    assert.deepStrictEqual(numbers(w.server.rows), [1, 2, 3, 4]);
    assert.deepStrictEqual(w.server.rows.slice(1).map((r) => [r.reps, r.weightKg]), [[8, 60], [6, 60], [8, 65]]);
    assert.strictEqual(w.store.q.items.length, 0);
    assert.ok(w.overlay().setLogs.every((l) => !Q.isLocalSetId(l.id) && !l.pending));
    assert.ok(w.seen.every(noDuplicates) && w.seen.every((s) => s.setLogs.length === 4), "every intermediate screen shows each set exactly once");
  });

  await t("F2 a lost response (saved on the server, answer never came): the next replay takes the server's row, no duplicate", async () => {
    const w = world([row("r1", "sq", 1)]);
    w.logOffline("sq"); w.logOffline("sq");
    w.server.commitThenFail = true;
    const first = await Q.drainQueue(w.io);
    assert.deepStrictEqual([first.sent, first.stopped], [0, "retry"]);
    assert.strictEqual(w.store.q.items.length, 2, "both still waiting");
    const second = await Q.drainQueue(w.io);
    assert.deepStrictEqual([second.sent, second.stopped], [2, null]);
    assert.deepStrictEqual(numbers(w.server.rows), [1, 2, 3], "set 2 exists once");
    assert.strictEqual(w.server.posts, 2, "set 2 was posted once, set 3 once");
  });

  await t("F3 the connection drops mid-replay: what was sent stays sent, the rest waits in order and finishes next time", async () => {
    const w = world([]);
    w.logOffline("sq"); w.logOffline("sq"); w.logOffline("bn");
    const realPost = w.io.api.postSet; let calls = 0;
    w.io.api.postSet = async (...a) => { if (++calls === 2) throw networkError(); return realPost(...a); };
    const r1 = await Q.drainQueue(w.io);
    assert.deepStrictEqual([r1.sent, r1.stopped], [1, "retry"]);
    assert.deepStrictEqual(w.store.q.items.map((i) => [i.input.exerciseId, i.input.setNumber]), [["sq", 2], ["bn", 1]]);
    const r2 = await Q.drainQueue(w.io);
    assert.deepStrictEqual([r2.sent, r2.stopped], [2, null]);
    assert.deepStrictEqual(w.server.rows.map((r) => `${r.exerciseId}${r.setNumber}`), ["sq1", "sq2", "bn1"], "server order = logging order");
  });

  await t("F4 the workout was closed elsewhere (409): the sets are refused and recorded, other items carry on", async () => {
    const w = world([], { status: "completed" });
    w.logOffline("sq");
    w.store.q = Q.queueProgress(w.store.q, base(), 3);
    const res = await Q.drainQueue(w.io);
    assert.strictEqual(res.rejected.length, 1);
    assert.deepStrictEqual([res.rejected[0].reason, res.rejected[0].setNumber], ["closed", 1]);
    assert.strictEqual(w.store.q.items.length, 0, "the refused progress update is dropped quietly");
    assert.strictEqual(Q.rejectedFor(w.store.q, "u1", "s1").length, 1);
    assert.strictEqual(Q.clearRejected(w.store.q, "u1", "s1").rejected.length, 0);
  });

  await t("F5 auth lost (401): replay stops and keeps everything", async () => {
    const w = world([]);
    w.logOffline("sq");
    w.server.failGet = httpError(401);
    const res = await Q.drainQueue(w.io);
    assert.deepStrictEqual([res.sent, res.stopped, w.store.q.items.length], [0, "stop", 1]);
  });

  await t("F6 edited while it was being sent: the edit reaches the server as a follow-up change", async () => {
    let target;
    const w = world([], { duringPost: (store) => { store.q = Q.editQueuedSet(store.q, target.localId, { reps: 12 }); } });
    target = w.logOffline("sq");
    const res = await Q.drainQueue(w.io);
    assert.strictEqual(res.stopped, null);
    assert.deepStrictEqual(w.server.rows.map((r) => [r.setNumber, r.reps]), [[1, 12]]);
    assert.strictEqual(w.store.q.items.length, 0);
  });

  await t("F7 deleted while it was being sent: the server row is deleted too", async () => {
    let target;
    const w = world([], { duringPost: (store) => { store.q = Q.removeQueuedSet(store.q, target.localId); } });
    target = w.logOffline("sq");
    await Q.drainQueue(w.io);
    assert.deepStrictEqual(w.server.rows, []);
    assert.strictEqual(w.store.q.items.length, 0);
  });

  await t("F8 a synced set deleted offline, then a new set with its number and values: the new set is posted, not mistaken for the deleted one", async () => {
    const w = world([row("r1", "sq", 1), row("r2", "sq", 2)]);
    w.logOffline("bn");                                     // reads the session first (rows r1, r2)
    w.store.q = Q.queueDelete(w.store.q, base(), "r2");     // then r2 is deleted offline
    const again = w.logOffline("sq");                       // the overlay hides r2, so this is set 2 with r2's values
    assert.strictEqual(again.input.setNumber, 2);
    await Q.drainQueue(w.io);
    assert.deepStrictEqual(numbers(w.server.rows), [1, 2]);
    assert.ok(!w.server.rows.some((r) => r.id === "r2"), "r2 itself is gone");
    assert.strictEqual(w.server.posts, 2, "bn1 and the new sq2 were both posted");
  });

  await t("F9 edits and deletes of synced sets made offline are sent; a delete of a set that's already gone counts as done", async () => {
    const w = world([row("r1", "sq", 1), row("r2", "sq", 2)]);
    w.store.q = Q.queueEdit(w.store.q, base(), "r1", { reps: 5 });
    w.store.q = Q.queueDelete(w.store.q, base(), "r2");
    w.store.q = Q.queueDelete(w.store.q, base(), "r-gone");
    const res = await Q.drainQueue(w.io);
    assert.deepStrictEqual([res.sent, res.stopped], [3, null]);
    assert.deepStrictEqual(w.server.rows.map((r) => [r.id, r.reps]), [["r1", 5]]);
  });

  await t("F10 another account's items on this phone are neither sent nor counted", async () => {
    const w = world([]);
    w.store.q = Q.enqueueSet(w.store.q, queued({ exerciseId: "sq", setNumber: 1 }, { userId: "u2" }));
    const res = await Q.drainQueue(w.io);
    assert.deepStrictEqual([res.sent, w.server.rows.length, w.store.q.items.length], [0, 0, 1]);
    assert.strictEqual(Q.waitingSetCount(w.store.q, "u1"), 0);
    assert.strictEqual(Q.withQueuedChanges(w.cache.session, Q.itemsFor(w.store.q, "u1", "s1")), w.cache.session);
  });

  await t("F11 the exercise index logged offline is sent once, with the latest value", async () => {
    const w = world([]);
    w.store.q = Q.queueProgress(w.store.q, base(), 1);
    w.logOffline("sq");
    w.store.q = Q.queueProgress(w.store.q, base(), 2);
    await Q.drainQueue(w.io);
    assert.strictEqual(w.server.progress, 2);
  });

  // ---- 3. static: the screens go through the queue
  const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");
  await t("S1 Active Workout and the Set/Rest Tracker log through saveSet, read the queued session, and don't post sets directly", () => {
    for (const rel of ["screens/train/ActiveWorkoutScreen.tsx", "screens/train/SetRestTrackerScreen.tsx"]) {
      const src = read(rel);
      assert.ok(/\bsaveSet\(/.test(src), `${rel}: saveSet`);
      assert.ok(/useQueuedSession\(/.test(src), `${rel}: useQueuedSession`);
      assert.ok(!/\blogWorkoutSet\(/.test(src), `${rel}: no direct logWorkoutSet`);
      assert.ok(/<SetEditSheet[^>]*\boffline\b/.test(src), `${rel}: the edit sheet edits waiting sets`);
    }
  });
  await t("S2 Active Workout saves the exercise index through saveProgress and waits for the queue before finishing", () => {
    const src = read("screens/train/ActiveWorkoutScreen.tsx");
    assert.ok(!/\bupdateSessionProgress\(/.test(src), "no direct updateSessionProgress");
    assert.ok((src.match(/\bsaveProgress\(/g) || []).length >= 4, "next exercise, jump, superset step and list change all use saveProgress");
    assert.ok(/flushOfflineSets\(sessionId\)/.test(src) && /completeWorkoutSession\(sessionId\)/.test(src));
    assert.ok(src.indexOf("flushOfflineSets(sessionId)") < src.indexOf("completeWorkoutSession(sessionId)"), "flush comes before complete");
  });
  await t("S3 the store is started once from the app root", () => {
    const app = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");
    assert.ok(/<OfflineSetSync\s*\/>/.test(app));
  });

  console.log(results.join("\n"));
  console.log(`\n${results.length - failures}/${results.length} passed`);
  if (failures) process.exit(1);
})();
