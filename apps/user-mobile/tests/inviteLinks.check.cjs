// Invite links (lib/inviteLinks.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/inviteLinks.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "inviteLinks.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { parseAcquisitionContext: parse, gymCodeFromContext, describeAcquisitionContext } = m.exports;

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

t("L1 join links (the original shape), with any app scheme", () => {
  assert.strictEqual(parse("fynrox://join?source=gym&code=ABC123"), "gym:ABC123");
  assert.strictEqual(parse("fynrox://join?source=creator&code=XYZ"), "creator:XYZ");
  assert.strictEqual(parse("primefit://join/?code=%20ABC%20&source=gym"), "gym:ABC");
});

t("L2 the API deep-link provider's app links: fynrox://gym/<code> and fynrox://r/<code>", () => {
  assert.strictEqual(parse("fynrox://gym/ELEV8"), "gym:ELEV8");
  assert.strictEqual(parse("fynrox://gym/ELEV8/"), "gym:ELEV8");
  assert.strictEqual(parse("fynrox://r/CREATOR1"), "creator:CREATOR1");
  assert.strictEqual(parse("fynrox://gym/A%20B"), "gym:A B");
});

t("L3 Expo dev-client links (…/--/path) parse the same", () => {
  assert.strictEqual(parse("exp://192.168.1.5:8081/--/join?source=gym&code=ABC"), "gym:ABC");
  assert.strictEqual(parse("exp://192.168.1.5:8081/--/gym/ABC"), "gym:ABC");
});

t("L4 anything else is not captured (and never throws)", () => {
  for (const u of [
    "fynrox://join?source=ads&code=ABC",
    "fynrox://join?source=gym",
    "fynrox://join?source=gym&code=%20%20",
    "fynrox://gym/",
    "fynrox://gym/A/B",
    "fynrox://program/123",
    "fynrox://more/medicine",
    "https://fynrox.com/gym/ABC",
    "",
    "not a url",
    `fynrox://gym/${"x".repeat(65)}`,
  ]) {
    assert.strictEqual(parse(u), null, u);
  }
  assert.strictEqual(parse(undefined), null);
  // A badly encoded code is kept as typed rather than throwing (the API then says it is unknown).
  assert.strictEqual(parse("fynrox://gym/%E0%A4%A"), "gym:%E0%A4%A");
});

t("L5 gymCodeFromContext: only gym contexts give a partner code", () => {
  assert.strictEqual(gymCodeFromContext("gym:ELEV8"), "ELEV8");
  assert.strictEqual(gymCodeFromContext("creator:XYZ"), null);
  assert.strictEqual(gymCodeFromContext("gym:"), null);
  assert.strictEqual(gymCodeFromContext(null), null);
});

t("L6 describeAcquisitionContext", () => {
  assert.strictEqual(describeAcquisitionContext("gym:ELEV8"), "Invited via gym code ELEV8");
  assert.strictEqual(describeAcquisitionContext("creator:XYZ"), "Invited via creator code XYZ");
  assert.strictEqual(describeAcquisitionContext("other:1"), null);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
