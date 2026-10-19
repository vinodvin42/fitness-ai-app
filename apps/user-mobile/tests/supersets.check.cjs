// Superset rules (Figma 03b log/03, Batch 3b). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/supersets.check.cjs
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
const s = load("lib/supersets.ts");
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

const list = [
  { exercise: { id: "warm" }, supersetGroup: null, targetSets: 1 },
  { exercise: { id: "bench" }, supersetGroup: "A", targetSets: 3 },
  { exercise: { id: "row" }, supersetGroup: "A", targetSets: 3 },
  { exercise: { id: "curl" }, supersetGroup: null, targetSets: 3 },
];
const counts = (o) => (id) => o[id] ?? 0;

t("L1 labels A1/A2, none outside a superset; next free letter skips used ones", () => {
  assert.deepStrictEqual([0, 1, 2, 3].map((i) => s.supersetLabel(list, i)), [null, "A1", "A2", null]);
  assert.strictEqual(s.nextFreeLetter(list), "B");
  assert.strictEqual(s.nextFreeLetter(list.map((e) => ({ ...e, supersetGroup: null }))), "A");
});
t("F1 outside a superset: stay and rest", () => assert.deepStrictEqual(s.afterWorkingSet(list, 3, counts({ curl: 1 })), { nextIndex: 3, rest: true }));
t("F2 A1 set done -> A2 without rest", () => assert.deepStrictEqual(s.afterWorkingSet(list, 1, counts({ bench: 1 })), { nextIndex: 2, rest: false }));
t("F3 A2 set done -> rest, then back to A1", () =>
  assert.deepStrictEqual(s.afterWorkingSet(list, 2, counts({ bench: 1, row: 1 })), { nextIndex: 1, rest: true }));
t("F4 partner already finished its sets -> skip it", () => {
  assert.deepStrictEqual(s.afterWorkingSet(list, 1, counts({ bench: 2, row: 3 })), { nextIndex: 1, rest: true });
  assert.deepStrictEqual(s.afterWorkingSet(list, 2, counts({ bench: 3, row: 2 })), { nextIndex: 2, rest: true });
});
t("F5 last round complete -> stay on the last partner and rest", () =>
  assert.deepStrictEqual(s.afterWorkingSet(list, 2, counts({ bench: 3, row: 3 })), { nextIndex: 2, rest: true }));
t("T1 set labels: W, numbered, D and F (drop and failure take no number)", () =>
  assert.deepStrictEqual(f.setRowLabels([{ isWarmup: true }, {}, {}, { isFailure: true }, { isDropSet: true }]), ["W", "1", "2", "F", "D"]));

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
