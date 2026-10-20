// Plan display rules (lib/planLineup.ts): comparison columns follow what admin has on sale, Basic is free, launch offer. Run from the
// repository root after npm ci:
//   node apps/user-mobile/tests/planLineup.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "planLineup.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { comparisonColumns, isFreePlan, hasLaunchOffer } = m.exports;

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

const basic = { id: "basic", name: "Basic", tier: "basic", priceCents: 0, billingCycle: "monthly" };
const grow = { id: "pro", name: "Grow", tier: "grow", priceCents: 29900, billingCycle: "monthly" };
const prime = { id: "elite", name: "Prime", tier: "prime", priceCents: 29900, billingCycle: "monthly" };

t("L1 the comparison has a column per tier on sale, in tier order, with the admin's plan names", () => {
  assert.deepStrictEqual(comparisonColumns([prime, basic]), [{ tier: "basic", name: "Basic" }, { tier: "prime", name: "Prime" }]);
  assert.deepStrictEqual(comparisonColumns([prime, grow, basic]).map((c) => c.tier), ["basic", "grow", "prime"]);
  // Renamed in admin, and a yearly plan in the same tier: the monthly plan names the column.
  assert.deepStrictEqual(comparisonColumns([basic, { ...prime, name: "Prime Plus" }, { ...prime, id: "elite-annual", name: "Prime yearly", billingCycle: "annual" }]), [
    { tier: "basic", name: "Basic" },
    { tier: "prime", name: "Prime Plus" },
  ]);
  assert.deepStrictEqual(comparisonColumns([]), []);
});

t("L2 Basic is the free plan; Prime and Grow are not", () => {
  assert.strictEqual(isFreePlan(basic), true);
  assert.strictEqual(isFreePlan(prime), false);
  assert.strictEqual(isFreePlan(grow), false);
  assert.strictEqual(isFreePlan({ tier: "prime", priceCents: 0 }), true);
});

t("L3 launch offer only while a higher price is scheduled", () => {
  assert.strictEqual(hasLaunchOffer({ ...prime, upcomingPrice: { priceCents: 49900, effectiveFrom: "2027-01-01" } }), true);
  assert.strictEqual(hasLaunchOffer({ ...prime, upcomingPrice: { priceCents: 19900, effectiveFrom: "2027-01-01" } }), false);
  assert.strictEqual(hasLaunchOffer({ ...prime, upcomingPrice: null }), false);
  assert.strictEqual(hasLaunchOffer(prime), false);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
