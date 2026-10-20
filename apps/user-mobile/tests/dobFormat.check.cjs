// Date of birth shown and typed as DD/MM/YYYY on View Profile (lib/dobFormat.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/dobFormat.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "dobFormat.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { isoToDmy, maskDmy, splitDmy } = m.exports;

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

t("D1 the stored date shows day first", () => {
  assert.strictEqual(isoToDmy("1995-01-15"), "15/01/1995");
  assert.strictEqual(isoToDmy("1995-01-15T00:00:00.000Z"), "15/01/1995");
  assert.strictEqual(isoToDmy(null), "");
  assert.strictEqual(isoToDmy("15/01/1995"), "");
});

t("D2 typing adds the slashes as each part starts", () => {
  assert.deepStrictEqual(["1", "15", "150", "1501", "15011", "15011995", "150119951"].map(maskDmy), [
    "1", "15", "15/0", "15/01", "15/01/1", "15/01/1995", "15/01/1995",
  ]);
});

t("D3 deleting back over a slash and pasting both work", () => {
  assert.strictEqual(maskDmy("15/0"), "15/0");
  assert.strictEqual(maskDmy("15/"), "15");
  assert.strictEqual(maskDmy("15-01-1995"), "15/01/1995");
  assert.strictEqual(maskDmy(" 15 01 1995 "), "15/01/1995");
});

t("D4 only a complete DD/MM/YYYY splits", () => {
  assert.deepStrictEqual(splitDmy("15/01/1995"), { day: "15", month: "01", year: "1995" });
  assert.strictEqual(splitDmy("15/01/95"), null);
  assert.strictEqual(splitDmy("1995-01-15"), null);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
