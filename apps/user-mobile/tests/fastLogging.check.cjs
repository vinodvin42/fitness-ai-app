// Fast set logging helpers (Figma "03b — Train · Fast logging"). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/fastLogging.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const load = (rel) => {
  const m = { exports: {} };
  const src = fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
};
const f = load("lib/fastLogging.ts");

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

t("W1 warm-ups from 24 kg dumbbells match Figma log/04 (10×10, 16×6, 20×3)", () =>
  assert.deepStrictEqual(f.warmUpSets(24, 2), [{ weightKg: 10, reps: 10 }, { weightKg: 16, reps: 6 }, { weightKg: 20, reps: 3 }]));
t("W2 barbell warm-ups round to 2.5 kg and stay below the working weight", () =>
  assert.deepStrictEqual(f.warmUpSets(60, 2.5), [{ weightKg: 25, reps: 10 }, { weightKg: 40, reps: 6 }, { weightKg: 50, reps: 3 }]));
t("W3 too light to split: no warm-ups (no zero, duplicate or working-weight rows)", () => {
  assert.deepStrictEqual(f.warmUpSets(2, 2), []);
  assert.deepStrictEqual(f.warmUpSets(0, 2), []);
  assert.deepStrictEqual(f.warmUpSets(4, 2), [{ weightKg: 2, reps: 10 }]);
});
// Fewest plates: 60 kg is one 20 a side. Figma log/05's sample shows 15 + 5, which is what you get without 20s:
t("P1 60 kg on a 20 kg bar: 20 a side, or 15 + 5 when 20s are left out (Figma log/05)", () => {
  assert.deepStrictEqual(f.plateLoad(60, 20, f.PLATES.kg), { perSide: [20], loaded: 60, exact: true });
  assert.deepStrictEqual(f.plateLoad(60, 20, f.PLATES.kg.filter((p) => p !== 20)).perSide, [15, 5]);
});
t("P2 small plates: 57.5 kg = 15 + 2.5 + 1.25 a side", () =>
  assert.deepStrictEqual(f.plateLoad(57.5, 20, f.PLATES.kg).perSide, [15, 2.5, 1.25]));
t("P3 a missing plate falls back to smaller ones; unreachable totals are flagged, never overshot", () => {
  assert.deepStrictEqual(f.plateLoad(60, 20, [20, 10, 5]).perSide, [20]);
  const r = f.plateLoad(61, 20, f.PLATES.kg);
  assert.strictEqual(r.exact, false);
  assert.ok(r.loaded <= 61, `loaded ${r.loaded}`);
});
t("P4 below the bar: no load", () => assert.strictEqual(f.plateLoad(15, 20, f.PLATES.kg), null));
t("H1 previous = newest other COMPLETED session of the same workout", () => {
  const history = [
    { id: "now", workoutId: "w1", status: "in_progress" },
    { id: "a", workoutId: "w2", status: "completed" },
    { id: "b", workoutId: "w1", status: "abandoned" },
    { id: "c", workoutId: "w1", status: "completed" },
    { id: "d", workoutId: "w1", status: "completed" },
  ];
  assert.strictEqual(f.previousSessionId(history, "w1", "now"), "c");
  assert.strictEqual(f.previousSessionId(history, "w9", "now"), undefined);
  assert.strictEqual(f.previousSessionId(undefined, "w1", "now"), undefined);
});
t("L1 row labels: W for warm-ups, D for drop sets, working sets numbered 1..n", () =>
  assert.deepStrictEqual(
    f.setRowLabels([{ isWarmup: true }, {}, {}, { isDropSet: true }, {}]),
    ["W", "1", "2", "D", "3"],
  ));
t("F1 formatting", () => {
  assert.strictEqual(f.formatSetValues({ weightKg: 57.5, reps: 8 }), "57.5 × 8");
  assert.strictEqual(f.formatSetValues({ weightKg: null, reps: 12 }), "× 12");
  assert.strictEqual(f.formatSetValues(undefined), "—");
  assert.strictEqual(f.formatWeight(24), "24");
  assert.strictEqual(f.formatWeight(1.25), "1.25");
});
t("E1 plate calculator only for barbells", () => {
  assert.ok(f.isBarbell("Barbell") && f.isBarbell("EZ curl bar"));
  assert.ok(!f.isBarbell("Dumbbell") && !f.isBarbell("Cable machine"));
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
