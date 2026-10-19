// Shared-cache race check for set numbering (Oct 2026). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/setNumberingCache.check.cjs
// Uses the REAL @tanstack/query-core QueryClient and the real src/lib/setNumbering.ts. A fake request layer lets each
// check decide when every session refetch answers; each refetch returns the server rows as they were when it was SENT.
// Question: can a late (stale) session refetch overwrite a set that was just saved and written into the cache?
// The screens do: await logWorkoutSet → setQueryData(withSetLog) → invalidateQueries (ActiveWorkout: not awaited;
// tracker: awaited). invalidateQueries defaults to cancelRefetch: true, which silently cancels an in-flight fetch.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");
const { QueryClient, QueryObserver } = require("@tanstack/query-core");
const load = (rel) => { const m = { exports: {} }; new Function("module", "exports", "require", ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText)(m, m.exports, require); return m.exports; };
const { nextSetNumber, setLogsFor, withSetLog } = load("lib/setNumbering.ts");
const tick = () => new Promise((r) => setImmediate(r));
const row = (id, setNumber) => ({ id, exerciseId: "sq", setNumber, reps: 8, weightKg: 60, rpe: null, isWarmup: false, isDropSet: false, note: null, loggedAt: "t" });
const KEY = ["workoutSession", "s1"];

function world() {
  const server = { rows: [row("r1", 1)] };
  const inFlight = []; // each: { resolve, snapshot }
  // the app's QueryClient defaults (src/lib/queryClient.ts): retry 1, staleTime 30s
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });
  const queryFn = () => new Promise((resolve) => inFlight.push({ resolve, snapshot: { setLogs: server.rows.map((r) => ({ ...r })) } }));
  const observer = new QueryObserver(qc, { queryKey: KEY, queryFn }); // a mounted screen's useQuery
  const unsubscribe = observer.subscribe(() => {});
  const answer = async (i) => { const [f] = inFlight.splice(i, 1); f.resolve(f.snapshot); await tick(); await tick(); };
  const cached = () => (qc.getQueryData(KEY)?.setLogs || []).map((r) => r.setNumber);
  const commit = (r) => { server.rows.push(r); return r; }; // POST /sets committed on the server
  const next = () => nextSetNumber(setLogsFor(qc.getQueryData(KEY).setLogs, "sq"));
  return { qc, observer, unsubscribe, inFlight, answer, cached, commit, next, server };
}
const results = []; let failures = 0;
async function t(name, fn) { try { await fn(); results.push(`PASS  ${name}`); } catch (e) { failures++; results.push(`FAIL  ${name}\n      ${e.message.split("\n")[0]}`); } }

(async () => {
  await t("C1 app order (setQueryData, then invalidateQueries): a stale refetch already in flight answers LATE and is discarded", async () => {
    const w = world(); await w.answer(0);                     // first load: [1]
    w.observer.refetch();                                     // background refetch A, sent before the save
    assert.strictEqual(w.inFlight.length, 1);
    const created = w.commit(row("r2", 2));                   // the save commits on the server
    w.qc.setQueryData(KEY, (s) => withSetLog(s, created));    // ActiveWorkoutScreen / SetRestTrackerScreen
    w.qc.invalidateQueries({ queryKey: KEY });                // cancels A (cancelRefetch: true), sends B
    assert.strictEqual(w.inFlight.length, 2, "A is still pending at the network level; B was sent");
    await w.answer(0);                                        // A answers late with the old rows [1]
    assert.deepStrictEqual(w.cached(), [1, 2], "the late stale answer did not overwrite the saved set");
    assert.strictEqual(w.next(), 3);
    await w.answer(0);                                        // B answers with [1, 2]
    assert.deepStrictEqual(w.cached(), [1, 2]);
    w.unsubscribe();
  });

  await t("C2 negative control: setQueryData WITHOUT the invalidate lets the stale answer overwrite the saved set (so the order matters)", async () => {
    const w = world(); await w.answer(0);
    w.observer.refetch();
    const created = w.commit(row("r2", 2));
    w.qc.setQueryData(KEY, (s) => withSetLog(s, created));
    await w.answer(0);                                        // A answers late with [1]
    assert.deepStrictEqual(w.cached(), [1], "expected the overwrite this check exists to detect");
    assert.strictEqual(w.next(), 2, "the next set would reuse number 2");
    w.unsubscribe();
  });

  await t("C3 tracker order (setQueryData, then await invalidateQueries): same protection", async () => {
    const w = world(); await w.answer(0);
    w.observer.refetch();
    const created = w.commit(row("r2", 2));
    w.qc.setQueryData(KEY, (s) => withSetLog(s, created));
    const inv = w.qc.invalidateQueries({ queryKey: KEY });
    await w.answer(0);                                        // stale A
    assert.deepStrictEqual(w.cached(), [1, 2]);
    await w.answer(0); await inv;                             // B
    assert.deepStrictEqual(w.cached(), [1, 2]);
    w.unsubscribe();
  });

  await t("C4 two quick logs: the second save cancels the first save's refetch (which no longer has the newest set)", async () => {
    const w = world(); await w.answer(0);
    const c2 = w.commit(row("r2", w.next())); w.qc.setQueryData(KEY, (s) => withSetLog(s, c2)); w.qc.invalidateQueries({ queryKey: KEY }); // B sent: [1,2]
    const c3 = w.commit(row("r3", w.next())); w.qc.setQueryData(KEY, (s) => withSetLog(s, c3)); w.qc.invalidateQueries({ queryKey: KEY }); // cancels B, C sent: [1,2,3]
    await w.answer(0);                                        // B answers late with [1,2]
    assert.deepStrictEqual(w.cached(), [1, 2, 3]);
    await w.answer(0);                                        // C
    assert.deepStrictEqual(w.cached(), [1, 2, 3]);
    assert.deepStrictEqual(w.server.rows.map((r) => r.setNumber), [1, 2, 3], "numbers sent were 2 then 3");
    w.unsubscribe();
  });

  await t("C5 a refetch that is not cancelled but was sent after the save returns the saved set", async () => {
    const w = world(); await w.answer(0);
    const created = w.commit(row("r2", 2));
    w.qc.setQueryData(KEY, (s) => withSetLog(s, created));
    w.observer.refetch({ cancelRefetch: false });             // e.g. a focus/reconnect refetch (query-core uses cancelRefetch: false)
    await w.answer(0);
    assert.deepStrictEqual(w.cached(), [1, 2]);
    w.unsubscribe();
  });

  // The protection above depends on the screens' order: setQueryData, then invalidateQueries without cancelRefetch: false.
  for (const [id, rel] of [["S1", "screens/train/ActiveWorkoutScreen.tsx"], ["S2", "screens/train/SetRestTrackerScreen.tsx"]]) {
    await t(`${id} ${path.basename(rel)}: onLogSet writes the created set, then invalidates the session query (cancelRefetch not disabled)`, () => {
      const src = fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8");
      const body = src.slice(src.indexOf("const onLogSet = async"), src.indexOf("};", src.indexOf("const onLogSet = async")));
      const a = body.indexOf("setQueryData<WorkoutSession>([\"workoutSession\", sessionId]");
      const b = body.indexOf("invalidateQueries({ queryKey: [\"workoutSession\", sessionId] })");
      assert.ok(a > 0 && b > a, `setQueryData at ${a}, invalidateQueries at ${b}`);
      assert.ok(!/cancelRefetch:\s*false/.test(body), "cancelRefetch: false would let a stale refetch land");
    });
  }

  console.log(results.join("\n"));
  console.log(failures ? `${failures} failure(s)` : `${results.length}/${results.length} passed`);
  process.exitCode = failures ? 1 : 0;
})();
