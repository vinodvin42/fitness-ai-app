// Set numbering across Active Workout and the Set/Rest Tracker (Oct 2026). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/setNumbering.check.cjs
// user-mobile has no test runner, so this is a plain Node script; it exits non-zero on any failure.
//   1. unit checks of the real src/lib/setNumbering.ts;
//   2. a flow simulation: the two screens' logging steps (as written in the screens, cited) over one shared session
//      cache and an in-memory server that, like the real API, accepts any setNumber (no unique constraint);
//   3. static checks (TypeScript AST) that both screens actually use the shared helpers.
// The screens themselves cannot run in Node. This change fixes numbering between the screens only; it does NOT
// prevent duplicate rows from repeated requests (retry after a lost response, double tap, two devices). Part 2
// shows that explicitly.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");
const SRC = path.join(__dirname, "..", "src");
const load = (rel) => { const m = { exports: {} }; new Function("module", "exports", "require", ts.transpileModule(fs.readFileSync(path.join(SRC, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText)(m, m.exports, require); return m.exports; };
const { nextSetNumber, setLogsFor, withSetLog } = load("lib/setNumbering.ts");
const results = []; let failures = 0;
function t(name, fn) { try { fn(); results.push(`PASS  ${name}`); } catch (e) { failures++; results.push(`FAIL  ${name}\n      ${e.message.split("\n")[0]}`); } }
const row = (id, exerciseId, setNumber) => ({ id, exerciseId, setNumber, reps: 8, weightKg: 60, rpe: null, isWarmup: false, isDropSet: false, note: null, loggedAt: "t" });

// ---- 1. unit
t("U1 nextSetNumber: none recorded → 1", () => assert.strictEqual(nextSetNumber([]), 1));
t("U2 nextSetNumber: 1,2 → 3", () => assert.strictEqual(nextSetNumber([{ setNumber: 1 }, { setNumber: 2 }]), 3));
t("U3 nextSetNumber after a deleted set (1,3) → 4, never reuses 3", () => assert.strictEqual(nextSetNumber([{ setNumber: 1 }, { setNumber: 3 }]), 4));
t("U4 nextSetNumber with an existing duplicate (1,2,2) → 3", () => assert.strictEqual(nextSetNumber([{ setNumber: 1 }, { setNumber: 2 }, { setNumber: 2 }]), 3));
t("U5 setLogsFor: only this exercise, in set order", () => assert.deepStrictEqual(setLogsFor([row("c", "sq", 3), row("a", "sq", 1), row("b", "bn", 1)], "sq").map((r) => r.id), ["a", "c"]));
t("U6 withSetLog adds the created row", () => assert.deepStrictEqual(withSetLog({ setLogs: [row("a", "sq", 1)] }, row("b", "sq", 2)).setLogs.map((r) => r.id), ["a", "b"]));
t("U7 withSetLog ignores a row already in the session", () => { const s = { setLogs: [row("a", "sq", 1)] }; assert.strictEqual(withSetLog(s, row("a", "sq", 1)), s); });
t("U8 withSetLog ignores a response that is not a set row, and an empty cache", () => { const s = { setLogs: [] }; assert.strictEqual(withSetLog(s, { ok: true }), s); assert.strictEqual(withSetLog(undefined, row("a", "sq", 1)), undefined); });

// ---- 2. flow simulation
function world(initialRows = []) {
  const server = { rows: initialRows.slice(), seq: initialRows.length, failNextGet: false };
  const api = {
    get: () => { if (server.failNextGet) { server.failNextGet = false; throw new Error("network"); } return { setLogs: server.rows.map((r) => ({ ...r })) }; },
    post: (body) => { const r = row(`r${++server.seq}`, body.exerciseId, body.setNumber); server.rows.push(r); return r; }, // plain create, like logSet
    del: (id) => { server.rows = server.rows.filter((r) => r.id !== id); },
  };
  const cache = { session: undefined }; // ["workoutSession", sessionId]
  const refetch = () => { try { cache.session = api.get(); } catch { /* query keeps its last data, as React Query does */ } };
  const sent = [];
  const aw = { hydrated: false };
  // ActiveWorkoutScreen.onLogSet: guard; nextSetNumber(setLogsFor(session.setLogs, exercise)); setQueryData(withSetLog); invalidate
  const activeWorkoutLog = (ex) => {
    if (!aw.hydrated || !cache.session) return "blocked";
    const created = api.post({ exerciseId: ex, setNumber: nextSetNumber(setLogsFor(cache.session.setLogs, ex)) });
    sent.push(created.setNumber); cache.session = withSetLog(cache.session, created); refetch(); return created.setNumber;
  };
  // SetRestTrackerScreen.onLogSet (renders only once the session has loaded): same numbering and cache update
  const trackerLog = (ex) => {
    if (!cache.session) return "blocked";
    const created = api.post({ exerciseId: ex, setNumber: nextSetNumber(setLogsFor(cache.session.setLogs, ex)) });
    sent.push(created.setNumber); cache.session = withSetLog(cache.session, created); refetch(); return created.setNumber;
  };
  const load = () => { refetch(); aw.hydrated = !!cache.session; }; // query loads; hydration effect runs
  const duplicates = () => { const seen = new Map(); for (const r of server.rows) { const k = `${r.exerciseId}#${r.setNumber}`; seen.set(k, (seen.get(k) || 0) + 1); } return [...seen].filter(([, n]) => n > 1).map(([k]) => k); };
  const activeWorkoutList = (ex) => (cache.session ? setLogsFor(cache.session.setLogs, ex).map((r) => r.setNumber) : []);
  return { server, api, cache, sent, aw, activeWorkoutLog, trackerLog, load, duplicates, activeWorkoutList, refetch };
}
t("F1 the reported flow: Active Workout logs, tracker logs, back, Active Workout logs → sends 1, 2, 3; no duplicate numbers", () => {
  const w = world(); w.load();
  w.activeWorkoutLog("sq"); w.trackerLog("sq"); w.activeWorkoutLog("sq");
  assert.deepStrictEqual(w.sent, [1, 2, 3]); assert.deepStrictEqual(w.duplicates(), []);
  assert.deepStrictEqual(w.activeWorkoutList("sq"), [1, 2, 3], "Active Workout shows the tracker's set too");
});
t("F2 two tracker logs in between → 1, 2, 3, 4", () => {
  const w = world(); w.load(); w.activeWorkoutLog("sq"); w.trackerLog("sq"); w.trackerLog("sq"); w.activeWorkoutLog("sq");
  assert.deepStrictEqual(w.sent, [1, 2, 3, 4]); assert.deepStrictEqual(w.duplicates(), []);
});
t("F3 restart mid-workout: numbering continues from the recorded sets", () => {
  const w = world([row("r1", "sq", 1), row("r2", "sq", 2)]); w.load();
  w.activeWorkoutLog("sq");
  assert.deepStrictEqual(w.sent, [3]); assert.deepStrictEqual(w.activeWorkoutList("sq"), [1, 2, 3]);
});
t("F4 tracker deletes set 2: the next set is 4, so number 3's row stays unique", () => {
  const w = world(); w.load(); w.activeWorkoutLog("sq"); w.activeWorkoutLog("sq"); w.activeWorkoutLog("sq");
  w.api.del("r2"); w.refetch(); w.trackerLog("sq");
  assert.deepStrictEqual(w.sent, [1, 2, 3, 4]); assert.deepStrictEqual(w.duplicates(), []);
});
t("F5 the refetch after a log fails: the created row is already in the cache, so the next number is still right", () => {
  const w = world(); w.load(); w.server.failNextGet = true; w.trackerLog("sq"); w.activeWorkoutLog("sq");
  assert.deepStrictEqual(w.sent, [1, 2]); assert.deepStrictEqual(w.duplicates(), []);
});
t("F6 before hydration (session not loaded yet): Active Workout does not log", () => {
  const w = world([row("r1", "sq", 1)]);
  assert.strictEqual(w.activeWorkoutLog("sq"), "blocked"); assert.deepStrictEqual(w.sent, []);
  w.load(); assert.strictEqual(w.activeWorkoutLog("sq"), 2);
});
t("F7 numbering is per exercise", () => {
  const w = world(); w.load(); w.activeWorkoutLog("sq"); w.trackerLog("bn"); w.activeWorkoutLog("sq");
  assert.deepStrictEqual(w.sent, [1, 1, 2]); assert.deepStrictEqual(w.duplicates(), []);
});
t("L1 NOT prevented (by design of this change): the same request sent twice still stores two rows", () => {
  const w = world(); w.load();
  const body = { exerciseId: "sq", setNumber: nextSetNumber(setLogsFor(w.cache.session.setLogs, "sq")) };
  w.api.post(body); w.api.post(body); // a retry after a lost response, or a double tap before the button disables
  assert.deepStrictEqual(w.duplicates(), ["sq#1"], "duplicates from repeated requests need server-side protection");
});

// ---- 3. static: the screens use the shared helpers
const parse = (rel) => ts.createSourceFile(rel, fs.readFileSync(path.join(SRC, rel), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (sf, fn) => { (function v(n) { fn(n); ts.forEachChild(n, v); })(sf); };
function facts(rel) {
  const sf = parse(rel); const f = { setNumberValues: [], setQueryDataWithSetLog: 0, useStateLoggedSets: false, listKeys: [], guards: [], disabled: [] };
  walk(sf, (n) => {
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === "setNumber" && ts.isObjectLiteralExpression(n.parent)
      && ts.isCallExpression(n.parent.parent) && ts.isIdentifier(n.parent.parent.expression) && n.parent.parent.expression.text === "logWorkoutSet") f.setNumberValues.push(n.initializer.getText(sf));
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "setQueryData" && n.arguments[1] && /withSetLog\(/.test(n.arguments[1].getText(sf))) f.setQueryDataWithSetLog++;
    if (ts.isVariableDeclaration(n) && n.name.getText(sf).includes("loggedSets") && n.initializer && /useState/.test(n.initializer.getText(sf))) f.useStateLoggedSets = true;
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === "key" && n.initializer && /^\{s\./.test(n.initializer.getText(sf))) f.listKeys.push(n.initializer.getText(sf));
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "onLogSet" && n.initializer) { const body = n.initializer.getText(sf); f.guards.push(/if \(([^)]*)\) return;/.exec(body)?.[1] || ""); }
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === "disabled" && n.parent && /onLogSet/.test(n.parent.getText(sf))) f.disabled.push(n.initializer.getText(sf));
  });
  return f;
}
const aw = facts("screens/train/ActiveWorkoutScreen.tsx");
const tr = facts("screens/train/SetRestTrackerScreen.tsx");
t("S1 Active Workout sends setNumber from nextSetNumber(the shared list)", () => assert.deepStrictEqual(aw.setNumberValues, ["nextSetNumber(loggedSets)"]));
t("S2 Set/Rest Tracker sends setNumber from nextSetNumber(the shared list)", () => assert.deepStrictEqual(tr.setNumberValues, ["nextSetNumber(exerciseSetLogs)"]));
t("S3 both screens write the created set into the shared session cache", () => assert.deepStrictEqual([aw.setQueryDataWithSetLog, tr.setQueryDataWithSetLog], [1, 1]));
t("S4 Active Workout keeps no local copy of the logged sets", () => assert.strictEqual(aw.useStateLoggedSets, false));
t("S5 Active Workout's set list is keyed by row id (duplicate numbers can't collide)", () => assert.ok(aw.listKeys.includes("{s.id}") && !aw.listKeys.includes("{s.setNumber}"), JSON.stringify(aw.listKeys)));
t("S6 Active Workout blocks logging before hydration (handler guard and button)", () => {
  assert.ok(aw.guards.some((g) => g.includes("!hasHydrated")), `guard: ${aw.guards}`);
  assert.ok(aw.disabled.some((d) => d.includes("!hasHydrated")), `disabled: ${aw.disabled}`);
});

console.log(results.join("\n"));
console.log(failures ? `${failures} failure(s)` : `${results.length}/${results.length} passed`);
process.exitCode = failures ? 1 : 0;
