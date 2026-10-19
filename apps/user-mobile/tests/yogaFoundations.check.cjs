// Yoga Foundations bundled program (content/yogaFoundations.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/yogaFoundations.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const cache = {};
const load = (rel) => {
  if (cache[rel]) return cache[rel].exports;
  const m = { exports: {} };
  cache[rel] = m;
  const src = fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const req = (spec) => (spec.startsWith("./") ? load(path.posix.join(path.posix.dirname(rel), spec) + ".ts") : require(spec));
  new Function("module", "exports", "require", out)(m, m.exports, req);
  return m.exports;
};
const y = load("content/yogaFoundations.ts");
const r = load("content/recover.ts");

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

const p = y.YOGA_FOUNDATIONS;
const sessions = p.weeks.flatMap((w) => w.sessions);
const minutes = (s) => s.steps.reduce((a, x) => a + x.seconds, 0) / 60;

t("Y1 4 weeks x 3 sessions, weeks numbered 1-4 with Figma's titles", () => {
  assert.deepStrictEqual(p.weeks.map((w) => w.week), [1, 2, 3, 4]);
  assert.ok(p.weeks.every((w) => w.sessions.length === p.daysPerWeek && p.daysPerWeek === 3));
  assert.deepStrictEqual(p.weeks.map((w) => w.title), [
    "Breath and posture basics",
    "Standing poses and balance",
    "Hip and hamstring mobility",
    "Your first full 30-minute flow",
  ]);
});
t("Y2 every session is 20-30 minutes and week 4 ends on a full 30", () => {
  for (const s of sessions) assert.ok(minutes(s) >= 20 && minutes(s) <= 30, `${s.id}: ${minutes(s)} min`);
  assert.strictEqual(minutes(sessions[sessions.length - 1]), 30);
});
t("Y3 unique ids that getRoutine opens; no clash with the bundled routines", () => {
  const ids = sessions.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const id of ids) assert.strictEqual(r.getRoutine(id)?.id, id);
  assert.ok(!r.GUIDED_ROUTINES.some((g) => ids.includes(g.id)));
});
t("Y4 every step has a title, cue and positive time; sessions start settled and end in rest", () => {
  for (const s of sessions) {
    for (const step of s.steps) assert.ok(step.title && step.instruction && step.summary && step.seconds > 0, `${s.id}: ${step.title}`);
    assert.strictEqual(s.steps[0].title, "Settle and breathe", s.id);
    assert.strictEqual(s.steps[s.steps.length - 1].title, "Rest", s.id);
  }
});
t("Y5 safety: every session carries the safety note; tree pose never on the knee", () => {
  for (const s of sessions) assert.ok(/Stop any pose that hurts/.test(s.safetyBody), s.id);
  const tree = sessions.flatMap((s) => s.steps).find((x) => x.title === "Tree pose");
  assert.ok(/never on the knee/.test(tree.instruction));
});
t("Y6 a draft is hidden outside development builds and names no instructor", () => {
  assert.strictEqual(p.reviewStatus, "draft");
  assert.strictEqual(p.reviewedBy, null);
  assert.deepStrictEqual(y.visibleYogaPrograms(false), []);
  assert.deepStrictEqual(y.visibleYogaPrograms(true).map((x) => x.id), ["yoga-foundations"]);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
