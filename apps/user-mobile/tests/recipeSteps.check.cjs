// Cooking-mode helpers (Figma Fuel 16). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/recipeSteps.check.cjs
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
const r = load("lib/recipeSteps.ts");

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

t("T1 a range uses its upper end (Figma: 3–4 minutes -> 4:00)", () => {
  assert.strictEqual(r.stepTimerSeconds("Sauté the onion for 3–4 minutes until soft."), 240);
  assert.strictEqual(r.stepTimerSeconds("Simmer 10-12 mins"), 720);
  assert.strictEqual(r.stepTimerSeconds("cook 2 to 3 minutes"), 180);
});
t("T2 single values and units", () => {
  assert.strictEqual(r.stepTimerSeconds("Simmer for 10 min"), 600);
  assert.strictEqual(r.stepTimerSeconds("Rest 30 seconds"), 30);
  assert.strictEqual(r.stepTimerSeconds("Bake 1 hour"), 3600);
});
t("T3 no duration, or an implausible one: no timer", () => {
  assert.strictEqual(r.stepTimerSeconds("Add 2 cups of water and stir."), null);
  assert.strictEqual(r.stepTimerSeconds("Marinate 8 hours"), null);
});
const ingredients = [
  { name: "Onion & capsicum", quantity: "1 cup" },
  { name: "Tomato", quantity: "1 medium" },
  { name: "Paneer", quantity: "100 g" },
  { name: "Green chillies", quantity: "2" },
  { name: "Oil", quantity: "1 tsp" },
];
t("I1 ingredients named in the step (word match, plural/singular)", () =>
  assert.deepStrictEqual(
    r.ingredientsInStep("Sauté the onions and tomatoes, then add a chilli.", ingredients).map((i) => i.name),
    ["Onion & capsicum", "Tomato", "Green chillies"],
  ));
t("I2 no partial-word or stop-word matches; short names (Oil) are not guessed", () => {
  assert.deepStrictEqual(r.ingredientsInStep("Crumble the paneers into the green pan with oil.", ingredients).map((i) => i.name), ["Paneer"]);
  assert.deepStrictEqual(r.ingredientsInStep("Garnish and serve.", ingredients), []);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
