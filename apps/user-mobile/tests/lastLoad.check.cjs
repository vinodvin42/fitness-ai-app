// Last load per exercise on Workout Detail (lib/lastLoad.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/lastLoad.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");
const load = (rel) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
};
const results = [];
let failures = 0;
const t = (name, fn) => {
  try {
    fn();
    results.push(`PASS  ${name}`);
  } catch (e) {
    failures++;
    results.push(`FAIL  ${name}\n      ${e.message}`);
  }
};

const { lastLoadFor } = load("lib/lastLoad.ts");
const s = (completedAt, sets) => ({ completedAt, setLogs: sets });
const set = (exerciseId, weightKg, reps, extra = {}) => ({ exerciseId, weightKg, reps, ...extra });

t("L1 heaviest working set of the most recent session with this exercise", () => {
  const h = [s("2026-10-10", [set("bench", 22, 10)]), s("2026-10-20", [set("bench", 24, 10), set("bench", 24, 8), set("bench", 30, 5, { isWarmup: true })]), s("2026-10-22", [set("squat", 60, 5)])];
  assert.strictEqual(lastLoadFor(h, "bench"), "24 kg × 10");
});
t("L2 bodyweight shows reps; never logged is null", () => {
  assert.strictEqual(lastLoadFor([s("2026-10-20", [set("pushup", null, 15), set("pushup", null, 12)])], "pushup"), "15 reps");
  assert.strictEqual(lastLoadFor([], "bench"), null);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
