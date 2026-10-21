// Notification links (lib/deepLink.ts) open the right screen. Run from the repository root after npm ci:
//   node apps/user-mobile/tests/deepLink.check.cjs
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

const { openNotificationDeepLink } = load("lib/deepLink.ts");
const open = (link) => {
  const calls = [];
  const ok = openNotificationDeepLink({ navigate: (...args) => calls.push(args) }, link);
  return { ok, calls };
};

t("N1 a coach message opens Conversations", () => {
  const { ok, calls } = open("coach-messages");
  assert.ok(ok);
  assert.deepStrictEqual(calls[0], ["More", { screen: "Conversations", initial: false }]);
});

t("N2 a payment notice opens Purchases", () => {
  assert.deepStrictEqual(open("payments").calls[0], ["More", { screen: "Purchases", initial: false }]);
});

t("N3 a reviewed form check opens Form Analysis, old primefit:// links too", () => {
  for (const link of ["fynrox://train/form-analysis", "primefit://train/form-analysis"]) {
    assert.deepStrictEqual(open(link).calls[0], ["Train", { screen: "FormAnalysis", initial: false }]);
  }
});

t("N4 existing links still work and unknown ones are ignored", () => {
  assert.deepStrictEqual(open("fynrox://train").calls[0], ["Train"]);
  assert.deepStrictEqual(open("subscription").calls[0], ["More", { screen: "Subscription", initial: false }]);
  assert.strictEqual(open("something-new").ok, false);
  assert.strictEqual(open(null).ok, false);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
