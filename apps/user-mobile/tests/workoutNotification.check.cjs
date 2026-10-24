// Workout notification text (owner, 24 Oct 2026: "Watch: via phone notifications"). Run from the repository root:
//   node apps/user-mobile/tests/workoutNotification.check.cjs
// The native modules are stubbed: only the pure text helper is checked here.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "workoutNotification.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const stub = (name) => (name === "react-native" ? { Platform: { OS: "web" } } : {});
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, stub);
const { liveWorkoutText } = m.exports;

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

const base = { workoutName: "Upper Body Strength", exerciseName: "Bench Press", setLine: "Set 3 of 4", nextLine: "Next: 24 kg × 10", restEndsAt: null };
t("N1 during a set: the exercise, then the set and the next numbers", () => {
  assert.deepStrictEqual(liveWorkoutText(base), { title: "Upper Body Strength", body: "Bench Press\nSet 3 of 4 · Next: 24 kg × 10" });
});
t("N2 while resting: when the rest ends comes first", () => {
  const { body } = liveWorkoutText({ ...base, restEndsAt: 1 }, () => "6:42 PM");
  assert.strictEqual(body, "Rest until 6:42 PM · Bench Press\nSet 3 of 4 · Next: 24 kg × 10");
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
