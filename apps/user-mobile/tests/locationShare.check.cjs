// "Share my location" text (Figma train/21, 24 Oct 2026). Run from the repository root:
//   node apps/user-mobile/tests/locationShare.check.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "locationShare.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { mapLink, locationShareMessage } = m.exports;

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

t("M1 the map link has 5 decimals (about a metre)", () => {
  assert.strictEqual(mapLink(17.4126271, 78.4071234), "https://maps.google.com/?q=17.41263,78.40712");
  assert.strictEqual(mapLink(-33.8, 151.2), "https://maps.google.com/?q=-33.80000,151.20000");
});
t("M2 the message names the activity and time, and says it doesn't update", () => {
  const msg = locationShareMessage("Run", 17.41263, 78.40712, "6:42 PM");
  assert.ok(msg.startsWith("I'm out on a run. Here's where I was at 6:42 PM: https://maps.google.com/?q=17.41263,78.40712"), msg);
  assert.ok(msg.includes("doesn't update"), msg);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
