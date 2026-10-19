// Body measurement parts (Figma "06b — Progress · Body measurements"). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/measurementParts.check.cjs
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
const p = load("lib/measurementParts.ts");

// Every stored tape column (packages/types BodyMeasurement *Cm fields, minus the legacy single armsCm/thighsCm).
const typesSrc = fs.readFileSync(path.join(__dirname, "..", "..", "..", "packages", "types", "src", "index.ts"), "utf8");
const body = typesSrc.slice(typesSrc.indexOf("export interface BodyMeasurement {"), typesSrc.indexOf("}", typesSrc.indexOf("export interface BodyMeasurement {")));
const storedCm = [...body.matchAll(/(\w+Cm): number \| null/g)].map((m) => m[1]).filter((f) => f !== "armsCm" && f !== "thighsCm");

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

const parts = Object.values(p.MEASUREMENT_PARTS);
t("M1 every part maps to a stored BodyMeasurement column, and every stored tape column has a part", () =>
  assert.deepStrictEqual(parts.map((x) => x.field).sort(), [...storedCm].sort()));
t("M2 body-map spots and compare rows only use known parts; no part twice on one view", () => {
  for (const spots of [p.FRONT_SPOTS, p.BACK_SPOTS]) {
    const keys = spots.map((s) => s.key);
    assert.ok(keys.every((k) => p.MEASUREMENT_PARTS[k]), keys.join());
    assert.strictEqual(new Set(keys).size, keys.length);
    for (const side of ["left", "right"]) {
      const rows = spots.filter((s) => s.side === side).map((s) => s.row).sort((a, b) => a - b);
      assert.deepStrictEqual(rows, rows.map((_, i) => i), `${side} rows must be 0..n-1`);
    }
  }
  assert.ok(p.COMPARE_ROWS.every((r) => r.keys.every((k) => p.MEASUREMENT_PARTS[k])));
});
t("M3 every part is reachable on the map (front or back) and in Compare", () => {
  const onMap = new Set([...p.FRONT_SPOTS, ...p.BACK_SPOTS].map((s) => s.key));
  const inCompare = new Set(p.COMPARE_ROWS.flatMap((r) => r.keys));
  for (const x of parts) {
    assert.ok(onMap.has(x.key), `${x.key} not on the map`);
    assert.ok(inCompare.has(x.key), `${x.key} not in Compare`);
  }
});
t("M4 guided log order: known parts, no repeats", () => {
  assert.ok(p.GUIDED_LOG_ORDER.every((k) => p.MEASUREMENT_PARTS[k]));
  assert.strictEqual(new Set(p.GUIDED_LOG_ORDER).size, p.GUIDED_LOG_ORDER.length);
});
const row = (at, extra) => ({ loggedAt: at, waistCm: null, bicepLeftCm: null, bicepRightCm: null, ...extra });
t("H1 partHistory: oldest first, skips entries without the part", () =>
  assert.deepStrictEqual(
    p.partHistory([row("2026-10-24", { waistCm: 82 }), row("2026-09-24", { waistCm: 85 }), row("2026-10-01", {})], "waist"),
    [{ value: 85, at: "2026-09-24" }, { value: 82, at: "2026-10-24" }],
  ));
t("H2 rowMean: L/R average, one side alone, none -> null", () => {
  assert.strictEqual(p.rowMean(row("x", { bicepLeftCm: 35, bicepRightCm: 36 }), ["bicepLeft", "bicepRight"]), 35.5);
  assert.strictEqual(p.rowMean(row("x", { bicepLeftCm: 35 }), ["bicepLeft", "bicepRight"]), 35);
  assert.strictEqual(p.rowMean(row("x", {}), ["bicepLeft", "bicepRight"]), null);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
