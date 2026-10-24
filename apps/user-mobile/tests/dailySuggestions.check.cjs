// Daily review rules (Figma 02b, owner-approved 7a). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/dailySuggestions.check.cjs
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
const d = load("lib/dailySuggestions.ts");

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

// Wed 21 Oct 2026, 09:00 local.
const WED = new Date(2026, 9, 21, 9, 0, 0);
const hoursAgo = (h, from = WED) => new Date(from.getTime() - h * 3600_000).toISOString();
const base = (over = {}) => ({
  now: WED,
  mode: "ask",
  decisions: [],
  trainingDays: ["mon", "wed", "fri"],
  nextWorkoutName: "Upper Body Strength",
  trainedToday: false,
  lastCompleted: { completedAt: hoursAgo(40), workoutName: "Lower Body", avgRpe: 8.3 },
  readiness: { band: "moderate", score: 62 },
  recommendation: null,
  lighterRoutineLabel: "Shoulder & hamstring mobility · 8 min",
  ...over,
});
const kinds = (input) => d.computeDailySuggestions(input).map((s) => s.kind);

t("G1 hard effort (avg RPE >= 8 within 48 h) on a training day -> Go lighter, naming the RPE", () => {
  const [s] = d.computeDailySuggestions(base());
  assert.strictEqual(s.kind, "lighter_day");
  assert.ok(s.why.includes("RPE 8.3"), s.why);
  assert.deepStrictEqual(s.details.find((x) => x.label === "Your plan").value, "Unchanged");
});
t("G2 readiness band rest triggers it too, naming the score", () => {
  const [s] = d.computeDailySuggestions(base({ lastCompleted: null, readiness: { band: "rest", score: 41 } }));
  assert.ok(s && s.why.includes("41"), s && s.why);
});
t("G3 no trigger: RPE 7.9, or older than 48 h, or band moderate -> nothing", () => {
  assert.deepStrictEqual(kinds(base({ lastCompleted: { completedAt: hoursAgo(10), workoutName: "x", avgRpe: 7.9 } })), []);
  assert.deepStrictEqual(kinds(base({ lastCompleted: { completedAt: hoursAgo(49), workoutName: "x", avgRpe: 9 } })), []);
});
t("G4 not on a rest day, not after training today, not without a next workout", () => {
  assert.deepStrictEqual(kinds(base({ trainingDays: ["mon", "fri"] })), []);
  assert.deepStrictEqual(kinds(base({ trainedToday: true })), []);
  assert.deepStrictEqual(kinds(base({ nextWorkoutName: null })), []);
  assert.deepStrictEqual(kinds(base({ trainingDays: [] })), ["lighter_day"], "no training days set: any day with a next workout");
});
const rec = { id: "r1", kind: "switch_program", status: "active", suggestedProgramName: "Strength Basics", rationale: "You finished 3 weeks at RPE 6. A harder block fits. Extra text." };
t("P1 an active switch_program recommendation is offered (first sentence as the reason); no_change / decided ones are not", () => {
  const out = d.computeDailySuggestions(base({ lastCompleted: null, recommendation: rec }));
  assert.deepStrictEqual(out.map((s) => [s.kind, s.recommendationId, s.why]), [["switch_program", "r1", "You finished 3 weeks at RPE 6."]]);
  assert.deepStrictEqual(kinds(base({ lastCompleted: null, recommendation: { ...rec, kind: "no_change" } })), []);
  assert.deepStrictEqual(kinds(base({ lastCompleted: null, recommendation: { ...rec, status: "declined" } })), []);
});
t("M1 at most two a day, lighter first", () => assert.deepStrictEqual(kinds(base({ recommendation: rec })), ["lighter_day", "switch_program"]));
t("D1 decided today -> hidden today; used yesterday -> may come back; skipped this week -> hidden all week", () => {
  const today = d.localDate(WED);
  assert.deepStrictEqual(kinds(base({ decisions: [{ key: `lighter_day:${today}`, kind: "lighter_day", date: today, outcome: "used" }] })), []);
  assert.deepStrictEqual(kinds(base({ decisions: [{ key: "lighter_day:2026-10-20", kind: "lighter_day", date: "2026-10-20", outcome: "used" }] })), ["lighter_day"]);
  assert.deepStrictEqual(kinds(base({ decisions: [{ key: "lighter_day:2026-10-19", kind: "lighter_day", date: "2026-10-19", outcome: "skipped" }] })), []);
  assert.deepStrictEqual(
    kinds(base({ decisions: [{ key: "lighter_day:2026-10-18", kind: "lighter_day", date: "2026-10-18", outcome: "skipped" }] })),
    ["lighter_day"],
    "Sun 18 Oct is the previous ISO week",
  );
});
t("S1 modes: off -> none; weekly -> Sundays only", () => {
  assert.deepStrictEqual(kinds(base({ mode: "off" })), []);
  assert.deepStrictEqual(kinds(base({ mode: "weekly" })), []);
  const sun = new Date(2026, 9, 25, 9, 0, 0);
  assert.deepStrictEqual(
    kinds(base({ mode: "weekly", now: sun, trainingDays: [], lastCompleted: { completedAt: hoursAgo(20, sun), workoutName: "x", avgRpe: 8.5 } })),
    ["lighter_day"],
  );
});
t("U1 helpers: ISO weeks, average RPE skips warm-ups and blanks, pruning keeps 90 days", () => {
  assert.strictEqual(d.isoWeekKey("2026-10-19"), "2026-W43");
  assert.strictEqual(d.isoWeekKey("2026-10-18"), "2026-W42");
  assert.strictEqual(d.isoWeekKey("2027-01-01"), "2026-W53");
  assert.strictEqual(d.averageRpe([{ rpe: 8 }, { rpe: 9 }, { rpe: null }, { rpe: 3, isWarmup: true }]), 8.5);
  assert.strictEqual(d.averageRpe([{ rpe: null }]), null);
  const kept = d.pruneDecisions([{ date: "2026-07-20" }, { date: "2026-07-30" }], WED).map((x) => x.date);
  assert.deepStrictEqual(kept, ["2026-07-30"]);
});

// Lighter week: completed sessions at 18:00 on the given local day, with their "How did it feel?".
const at = (y, m, day, feel) => ({ completedAt: new Date(y, m - 1, day, 18, 0, 0).toISOString(), feel });
// The four full weeks before Wed 21 Oct: 21-27 Sep, 28 Sep-4 Oct, 5-11 Oct, 12-18 Oct.
const HARD4 = [
  at(2026, 9, 22, "hard"), at(2026, 9, 24, "about_right"),
  at(2026, 9, 29, "about_right"), at(2026, 10, 1, "hard"),
  at(2026, 10, 6, "hard"), at(2026, 10, 8, null),
  at(2026, 10, 13, "easy"), at(2026, 10, 16, "hard"),
];
const lw = (over = {}, sessions = HARD4, enabled = true) => base({ lastCompleted: null, lightWeek: { enabled, sessions }, ...over });
t("L1 four weeks in a row with 2+ workouts and one rated Hard -> lighter week from the coming Monday, plan unchanged", () => {
  const out = d.computeDailySuggestions(lw());
  assert.deepStrictEqual(out.map((s) => [s.kind, s.key, s.title]), [["light_week", "light_week:2026-10-26", "Lighter week from Mon 26 Oct"]]);
  assert.strictEqual(out[0].details.find((x) => x.label === "Week").value, "Mon 26 Oct – Sun 1 Nov");
  assert.strictEqual(out[0].details.find((x) => x.label === "Your plan").value, "Unchanged");
});
t("L2 not when switched off, a week has 1 workout, or a week has no Hard", () => {
  assert.deepStrictEqual(kinds(lw({}, HARD4, false)), []);
  assert.deepStrictEqual(kinds(lw({}, HARD4.filter((_, i) => i !== 1))), [], "week 21-27 Sep has only one workout");
  assert.deepStrictEqual(kinds(lw({}, HARD4.map((s, i) => (i === 7 ? { ...s, feel: "about_right" } : s)))), [], "12-18 Oct has no Hard");
});
t("L3 not again within 28 days of a light-week decision (used or skipped)", () => {
  const dec = (date, outcome) => [{ key: "light_week:x", kind: "light_week", date, outcome }];
  assert.deepStrictEqual(kinds(lw({ decisions: dec("2026-10-01", "skipped") })), []);
  assert.deepStrictEqual(kinds(lw({ decisions: dec("2026-09-20", "used") })), ["light_week"]);
});
t("L4 on a Monday it starts today, counting the four weeks before it", () => {
  const MON = new Date(2026, 9, 26, 8, 0, 0);
  const sessions = [...HARD4.slice(2), at(2026, 10, 20, "hard"), at(2026, 10, 22, "easy")];
  const [s] = d.computeDailySuggestions(lw({ now: MON, trainingDays: [] }, sessions));
  assert.strictEqual(s && s.key, "light_week:2026-10-26");
});
t("L5 the lighter week is active Mon-Sun after Use it, not after Skip", () => {
  const used = [{ key: "light_week:2026-10-26", kind: "light_week", date: "2026-10-24", outcome: "used" }];
  assert.ok(d.activeLightWeek(used, new Date(2026, 9, 28, 12)));
  assert.ok(d.activeLightWeek(used, new Date(2026, 10, 1, 21)));
  assert.strictEqual(d.activeLightWeek(used, new Date(2026, 10, 2, 7)), null);
  assert.strictEqual(d.activeLightWeek(used, new Date(2026, 9, 25, 12)), null);
  assert.strictEqual(d.activeLightWeek([{ ...used[0], outcome: "skipped" }], new Date(2026, 9, 28, 12)), null);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
