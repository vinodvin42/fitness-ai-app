// Indian portions (lib/indianPortions.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/indianPortions.check.cjs
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

const p = load("lib/indianPortions.ts");
const dal = { name: "Dal tadka", amount: 1, unit: "katori", grams: 150, calories: 150, proteinG: 7, carbsG: 20, fatG: 5 };
const roti = { name: "Roti", amount: 2, unit: "roti", grams: 80, calories: 240, proteinG: 8, carbsG: 40, fatG: 6 };

t("I1 1½ katori of dal is 225 g and 225 kcal (Figma fuel/11)", () => {
  const r = p.rescale(dal, 1.5, "katori");
  assert.deepStrictEqual([r.grams, r.calories, r.proteinG], [225, 225, 11]);
  assert.strictEqual(p.portionText(1.5, "katori"), "1½ katori");
});
t("I2 switching units keeps the grams: 1 katori = 150 g; a roti item keeps grams per roti", () => {
  assert.strictEqual(p.convertAmount(dal, "g"), 150);
  assert.strictEqual(p.convertAmount(p.rescale(dal, 1.5, "katori"), "g"), 225);
  assert.strictEqual(p.rescale(dal, 150, "g").calories, 150);
  assert.strictEqual(p.rescale(roti, 3, "roti").grams, 120);
  assert.deepStrictEqual(p.unitOptions(roti), ["roti", "g"]);
  assert.deepStrictEqual(p.unitOptions(dal), ["katori", "bowl", "cup", "tbsp", "g"]);
});
t("I3 amounts read like the design", () => {
  assert.deepStrictEqual([0.5, 1, 1.5, 2, 2.25].map((n) => p.formatAmount(n, "katori")), ["½", "1", "1½", "2", "2¼"]);
  assert.deepStrictEqual(p.quickAmounts("roti"), [1, 2, 3]);
});
t("I4 totals follow the Not sure choice and removed items", () => {
  const curd = { name: "Curd", amount: 1, unit: "katori", grams: 150, calories: 90, proteinG: 5, carbsG: 7, fatG: 5, alt: { question: "Curd or raita?", name: "Raita", calories: 75, proteinG: 4, carbsG: 6, fatG: 4 } };
  assert.strictEqual(p.totals([dal, roti, curd], ["main", "main", "main"]).calories, 480);
  assert.strictEqual(p.totals([dal, roti, curd], ["main", "removed", "alt"]).calories, 225);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
