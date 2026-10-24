// Level from the first workout (Figma train/after-first-workout, 24 Oct 2026). Run from the repository root:
//   node apps/user-mobile/tests/trainingLevel.check.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "trainingLevel.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { levelAfterFirstWorkout: f } = m.exports;

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

t("L1 too easy moves up one step, capped at advanced", () => {
  assert.strictEqual(f("beginner", "easy"), "intermediate");
  assert.strictEqual(f("intermediate", "easy"), "advanced");
  assert.strictEqual(f("advanced", "easy"), "advanced");
});
t("L2 too hard moves down one step, floored at beginner", () => {
  assert.strictEqual(f("advanced", "hard"), "intermediate");
  assert.strictEqual(f("beginner", "hard"), "beginner");
});
t("L3 about right keeps it; no level on file counts as beginner", () => {
  assert.strictEqual(f("intermediate", "about_right"), "intermediate");
  assert.strictEqual(f(null, "about_right"), "beginner");
  assert.strictEqual(f(undefined, "easy"), "intermediate");
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
