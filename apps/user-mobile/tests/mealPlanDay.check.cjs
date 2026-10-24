// Today's planned meals (lib/mealPlanDay.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/mealPlanDay.check.cjs
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

const { plannedMealsToday } = load("lib/mealPlanDay.ts");
const item = (dayNumber, mealType, recipeName, calories) => ({ id: recipeName, dayNumber, mealType, recipeId: recipeName, recipeName, recipeImageUrl: null, calories, proteinG: 0, carbsG: 0, fatG: 0 });
const plan = { id: "p", version: 1, status: "generated", durationDays: 7, rationale: null, failureReason: null, isActive: true, createdAt: "2026-10-20T06:00:00", items: [item(1, "lunch", "Rajma rice", 640), item(3, "lunch", "Paneer wrap", 520), item(3, "dinner", "Dal", 400), item(3, "dinner", "Roti", 120)] };

t("P1 day 3 of a plan made on 20 Oct is 22 Oct", () => {
  const p = plannedMealsToday(plan, new Date("2026-10-22T13:00:00"));
  assert.deepStrictEqual(p.lunch.map((x) => x.recipeName), ["Paneer wrap"]);
  assert.deepStrictEqual(p.dinner.map((x) => x.recipeName), ["Dal", "Roti"]);
  assert.strictEqual(p.breakfast, undefined);
});
t("P2 nothing outside the plan's days, a failed plan or no plan", () => {
  assert.deepStrictEqual(plannedMealsToday(plan, new Date("2026-10-27T09:00:00")), {});
  assert.deepStrictEqual(plannedMealsToday(plan, new Date("2026-10-19T09:00:00")), {});
  assert.deepStrictEqual(plannedMealsToday({ ...plan, status: "failed" }, new Date("2026-10-20T09:00:00")), {});
  assert.deepStrictEqual(plannedMealsToday(null), {});
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
