// Exercise start/end frames (lib/exerciseFrames.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/exerciseFrames.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "exerciseFrames.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { exerciseFrames } = m.exports;

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

const base = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

t("F1 a free-exercise-db start still gives start and end frames", () => {
  assert.deepStrictEqual(exerciseFrames(`${base}Pushups/0.jpg`), [`${base}Pushups/0.jpg`, `${base}Pushups/1.jpg`]);
  assert.deepStrictEqual(exerciseFrames(` ${base}Barbell_Squat/0.jpg `), [`${base}Barbell_Squat/0.jpg`, `${base}Barbell_Squat/1.jpg`]);
});
t("F2 anything else stays a single still", () => {
  for (const url of [null, undefined, "", `${base}Pushups/1.jpg`, `${base}Pushups/0.png`, `${base}a/b/0.jpg`, "https://example.com/exercises/Pushups/0.jpg", `http://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pushups/0.jpg`, `${base}Pushups/0.jpg?x=1`]) {
    assert.strictEqual(exerciseFrames(url), null, String(url));
  }
});
t("F3 every seeded exercise image gets a pair", () => {
  const seed = fs.readFileSync(path.join(__dirname, "..", "..", "api", "src", "lib", "seedContent", "exercises.ts"), "utf8");
  const urls = [...seed.matchAll(/mediaUrl: "([^"]+)"/g)].map((x) => x[1]);
  assert.ok(urls.length >= 394, `found ${urls.length}`);
  for (const u of urls) assert.ok(exerciseFrames(u), u);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
