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
    // Figma geometry: inside the 358×290 card, chips on their own side, no two chips on one side overlapping.
    for (const s of spots) {
      assert.ok(s.point.left >= 0 && s.point.left + 8 <= 358 && s.point.top >= 0 && s.point.top + 8 <= 290, s.key);
      assert.ok(s.chipTop >= 0 && s.chipTop + 32 <= 290, s.key);
      assert.ok(s.leader.left >= 100 && s.leader.left + s.leader.width <= 250, `${s.key} leader between the chip columns`);
    }
    for (const side of ["left", "right"]) {
      const tops = spots.filter((s) => s.side === side).map((s) => s.chipTop).sort((a, b) => a - b);
      tops.slice(1).forEach((t, i) => assert.ok(t - tops[i] >= 30, `${side} chips overlap at ${t}`));
    }
  }
  assert.ok(p.COMPARE_ROWS.every((r) => r.keys.every((k) => p.MEASUREMENT_PARTS[k])));
});
t("M3 every part is in Compare; every part but the forearms (not in Figma's map) is on the map", () => {
  const onMap = new Set([...p.FRONT_SPOTS, ...p.BACK_SPOTS].map((s) => s.key));
  const inCompare = new Set(p.COMPARE_ROWS.flatMap((r) => r.keys));
  for (const x of parts) {
    if (!x.key.startsWith("forearm")) assert.ok(onMap.has(x.key), `${x.key} not on the map`);
    assert.ok(inCompare.has(x.key), `${x.key} not in Compare`);
  }
});
t("M4 guided log order: known parts, no repeats, Waist third then Hips (Figma measure-04)", () => {
  assert.ok(p.GUIDED_LOG_ORDER.every((k) => p.MEASUREMENT_PARTS[k]));
  assert.strictEqual(new Set(p.GUIDED_LOG_ORDER).size, p.GUIDED_LOG_ORDER.length);
  assert.strictEqual(p.GUIDED_LOG_ORDER[2], "waist");
  assert.strictEqual(p.GUIDED_LOG_ORDER[3], "hips");
});
t("M5 every part has a tape mark inside the 72×133.2 log outline", () => {
  for (const x of parts) {
    const m = p.LOG_MARKS[x.key];
    assert.ok(m, x.key);
    assert.ok(m.x1 >= 0 && m.x2 <= 72 && m.x1 < m.x2 && m.y > 0 && m.y < 133.2 && m.point >= m.x1 && m.point <= m.x2, x.key);
  }
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

const full = (at, v) => row(at, { neckCm: v, chestCm: v, waistCm: v, hipsCm: v });
t("C1 compare pair: latest full check vs the full check about four weeks before it", () => {
  const rows = [full("2026-08-24T08:00:00Z", 90), row("2026-09-10T08:00:00Z", { waistCm: 86 }), full("2026-09-24T08:00:00Z", 85), row("2026-10-17T08:00:00Z", { waistCm: 83 }), full("2026-10-24T08:00:00Z", 82)];
  const pr = p.defaultComparePair(rows);
  assert.strictEqual(pr.to.loggedAt, "2026-10-24T08:00:00Z");
  assert.strictEqual(pr.from.loggedAt, "2026-09-24T08:00:00Z");
});
t("C2 compare pair: falls back to any tape entries, null with fewer than two", () => {
  assert.strictEqual(p.defaultComparePair([full("2026-10-24", 82)]), null);
  const pr = p.defaultComparePair([row("2026-10-01", { waistCm: 84 }), row("2026-10-24", { waistCm: 82 })]);
  assert.strictEqual(pr.from.loggedAt, "2026-10-01");
});
t("C3 change arrows and lengths read like Figma", () => {
  assert.strictEqual(p.changeArrow(-3), "↓3.0");
  assert.strictEqual(p.changeArrow(1.5), "↑1.5");
  assert.strictEqual(p.changeArrow(0), "—");
  assert.strictEqual(p.changeArrow(null), null);
  assert.strictEqual(p.trimLen(82), "82");
  assert.strictEqual(p.trimLen(38.5), "38.5");
  assert.strictEqual(p.measureDate("2026-10-24T08:00:00", "day"), "Sat 24 Oct");
  assert.strictEqual(p.measureDate("2026-10-24T08:00:00", "dayComma"), "Sat, 24 Oct");
  assert.strictEqual(p.measureDate("2026-09-24T08:00:00", "dm"), "24 Sep");
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
