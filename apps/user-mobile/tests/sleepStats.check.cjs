// Sleep and recovery trend maths (lib/sleepStats.ts; owner, 25 Oct 2026: sleep need, stages, efficiency,
// consistency and trends in Recovery). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/sleepStats.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure. Runs in the machine's
// time zone, so bed and wake times below are built from local dates.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "sleepStats.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, () => ({}));
const S = m.exports;

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

const D = (day) => `2026-10-${String(day).padStart(2, "0")}`;
const at = (day, h, min = 0) => new Date(2026, 9, day, h, min).toISOString();
const row = (day, extra = {}) => ({
  date: D(day),
  sleepHours: null,
  sleepStart: null,
  sleepEnd: null,
  sleepInBedMin: null,
  sleepAwakeMin: null,
  sleepLightMin: null,
  sleepDeepMin: null,
  sleepRemMin: null,
  hrvMs: null,
  restingHeartRate: null,
  stressScore: null,
  soreness: null,
  energyLevel: null,
  recoveryScore: null,
  ...extra,
});

t("S1 efficiency: asleep / in bed; none for a self-log with only bed and wake times", () => {
  assert.strictEqual(S.efficiencyPct(row(24, { sleepHours: 7, sleepInBedMin: 480, sleepAwakeMin: 60 })), 88);
  assert.strictEqual(S.efficiencyPct(row(24, { sleepHours: 6.5, sleepInBedMin: 480 })), 81, "typed hours below time in bed");
  assert.strictEqual(S.efficiencyPct(row(24, { sleepHours: 8, sleepInBedMin: 480 })), null, "hours = time in bed: no awake data");
  assert.strictEqual(S.efficiencyPct(row(24, { sleepHours: 7 })), null);
});

t("S2 stages and their share of time asleep", () => {
  const s = S.stagesOf(row(24, { sleepAwakeMin: 30, sleepLightMin: 240, sleepDeepMin: 90, sleepRemMin: 90 }));
  assert.deepStrictEqual(s, { awake: 30, light: 240, deep: 90, rem: 90 });
  assert.deepStrictEqual(S.stageShares(s), { light: 57, deep: 21, rem: 21 });
  assert.strictEqual(S.stagesOf(row(24, { sleepHours: 7 })), null);
  const avg = S.averageStages([row(23, { sleepLightMin: 200, sleepDeepMin: 80, sleepRemMin: 100 }), row(24, { sleepLightMin: 240, sleepDeepMin: 100, sleepRemMin: 80, sleepAwakeMin: 20 }), row(22)]);
  assert.deepStrictEqual(avg, { awake: 10, light: 220, deep: 90, rem: 90, nights: 2 });
});

t("S3 sleep vs need: average, nights met and minutes short", () => {
  const v = S.sleepVsNeed([row(22, { sleepHours: 8 }), row(23, { sleepHours: 6.5 }), row(24, { sleepHours: 7.25 }), row(21)], 8);
  assert.strictEqual(v.nights, 3);
  assert.strictEqual(Math.round(v.avgHours * 100) / 100, 7.25);
  assert.strictEqual(v.metNights, 1);
  assert.strictEqual(v.debtMin, 90 + 45);
  assert.strictEqual(S.sleepVsNeed([row(24)], 8), null);
});

t("S4 consistency: bedtimes either side of midnight are close; needs 3 nights", () => {
  const nights = [
    row(21, { sleepStart: at(20, 23, 30), sleepEnd: at(21, 7) }),
    row(22, { sleepStart: at(22, 0, 30), sleepEnd: at(22, 7) }),
    row(23, { sleepStart: at(22, 23, 30), sleepEnd: at(23, 7) }),
    row(24, { sleepStart: at(24, 0, 30), sleepEnd: at(24, 7) }),
  ];
  const c = S.consistency(nights);
  assert.strictEqual(c.nights, 4);
  assert.strictEqual(c.bedtimeSpreadMin, 30, "23:30 / 00:30 alternating is a 30-minute spread, not hours");
  assert.strictEqual(c.wakeSpreadMin, 0);
  assert.strictEqual(c.label, "Very consistent");
  assert.strictEqual(S.clockText(c.avgBedMin + 720), S.clockText(0), "average bedtime is midnight");
  assert.strictEqual(S.consistency(nights.slice(0, 2)), null);
  const irregular = S.consistency([
    row(22, { sleepStart: at(21, 21), sleepEnd: at(22, 5) }),
    row(23, { sleepStart: at(23, 2), sleepEnd: at(23, 10) }),
    row(24, { sleepStart: at(23, 22), sleepEnd: at(24, 6) }),
  ]);
  assert.strictEqual(irregular.label, "Irregular");
});

t("S5 period averages compare with the period before", () => {
  const items = [row(11, { hrvMs: 40 }), row(12, { hrvMs: 44 }), row(18, { hrvMs: 50 }), row(24, { hrvMs: 54 }), row(20)];
  const stat = S.periodStat(items, (d) => d.hrvMs, 7, D(24));
  assert.deepStrictEqual(stat, { avg: 52, n: 2, prevAvg: 42, changePct: 24 });
  assert.strictEqual(S.periodStat(items, (d) => d.stressScore, 7, D(24)), null);
  assert.strictEqual(S.periodStat([row(24, { hrvMs: 50 })], (d) => d.hrvMs, 7, D(24)).changePct, null, "nothing to compare with");
});

t("S6 series keeps logged values in the period, oldest first", () => {
  const items = [row(16, { restingHeartRate: 60 }), row(18, { restingHeartRate: 58 }), row(23), row(24, { restingHeartRate: 57 })];
  assert.deepStrictEqual(S.series(items, (d) => d.restingHeartRate, 7, D(24)), [
    { date: D(18), value: 58 },
    { date: D(24), value: 57 },
  ]);
});

t("S7 small helpers", () => {
  assert.strictEqual(S.hm(425), "7h 05m");
  assert.strictEqual(S.hm(55), "55m");
  assert.strictEqual(S.daysBetween(D(20), D(24)), 4);
  assert.strictEqual(S.lastNight([row(22, { sleepHours: 7 }), row(24, { hrvMs: 50 })]).date, D(22));
  assert.strictEqual(S.stressWord(20), "low");
  assert.strictEqual(S.stressWord(50), "moderate");
  assert.strictEqual(S.stressWord(80), "high");
  assert.strictEqual(S.localYmd(new Date(2026, 9, 24, 23, 59)), D(24));
});

t("S8 bed and wake times: a late bedtime is the evening before, an after-midnight one the same morning", () => {
  const now = new Date(2026, 9, 24, 9, 0);
  assert.deepStrictEqual(S.bedWakeTimes("23:00", "07:00", now), { sleepStart: at(23, 23), sleepEnd: at(24, 7) });
  assert.deepStrictEqual(S.bedWakeTimes("01:15", "07:30", now), { sleepStart: at(24, 1, 15), sleepEnd: at(24, 7, 30) });
  assert.deepStrictEqual(S.bedWakeTimes("07:00", "07:00", now), { sleepStart: at(23, 7), sleepEnd: at(24, 7) }, "never zero or negative");
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
