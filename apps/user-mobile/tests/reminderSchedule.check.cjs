// Reminder start / end dates (lib/reminderSchedule.ts; owner, 25 Oct 2026: "start date and end date or
// number of days"). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/reminderSchedule.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure. Runs in the machine's
// time zone, so "now" and the expected alarms are built from local dates.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "reminderSchedule.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, () => ({}));
const R = m.exports;

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

// Sunday 25 Oct 2026, 09:00 local.
const NOW = new Date(2026, 9, 25, 9, 0);
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const eight = [{ hour: 8, minute: 0 }];
const local = (mo, d, h, min = 0) => new Date(2026, mo - 1, d, h, min).getTime();

t("R1 day counting: 'for N days' counts the start day, across month ends", () => {
  assert.strictEqual(R.endDateFromDays("2026-10-25", 1), "2026-10-25");
  assert.strictEqual(R.endDateFromDays("2026-10-25", 10), "2026-11-03");
  assert.strictEqual(R.endDateFromDays("2026-12-30", 5), "2027-01-03");
  assert.strictEqual(R.daysInclusive("2026-10-25", "2026-11-03"), 10);
  assert.strictEqual(R.addDays("2028-02-28", 1), "2028-02-29");
});

t("R2 no dates, or started long ago with a far end: the weekly repeating trigger, as before", () => {
  assert.deepStrictEqual(R.planSchedule({ daysOfWeek: EVERY_DAY, times: eight }, NOW), { kind: "weekly" });
  assert.deepStrictEqual(R.planSchedule({ daysOfWeek: EVERY_DAY, times: eight, startDate: "2026-10-01", endDate: "2026-12-31" }, NOW), { kind: "weekly" });
  // An end exactly WINDOW_DAYS away still repeats weekly; one day closer switches to dated alarms.
  assert.strictEqual(R.planSchedule({ daysOfWeek: EVERY_DAY, times: eight, endDate: R.addDays("2026-10-25", R.WINDOW_DAYS) }, NOW).kind, "weekly");
  assert.strictEqual(R.planSchedule({ daysOfWeek: EVERY_DAY, times: eight, endDate: R.addDays("2026-10-25", R.WINDOW_DAYS - 1) }, NOW).kind, "dated");
});

t("R3 ends soon: one alarm per day up to and including the end day, none already past", () => {
  const p = R.planSchedule({ daysOfWeek: EVERY_DAY, times: [{ hour: 8, minute: 0 }, { hour: 20, minute: 30 }], endDate: "2026-10-27" }, NOW);
  assert.strictEqual(p.kind, "dated");
  // 25 Oct 08:00 is already past at 09:00.
  assert.deepStrictEqual(
    p.at.map((d) => d.getTime()),
    [local(10, 25, 20, 30), local(10, 26, 8), local(10, 26, 20, 30), local(10, 27, 8), local(10, 27, 20, 30)],
  );
});

t("R4 starts later: alarms begin on the start day and cover WINDOW_DAYS days, chosen weekdays only", () => {
  // Mon / Wed / Fri from Mon 2 Nov.
  const p = R.planSchedule({ daysOfWeek: [1, 3, 5], times: eight, startDate: "2026-11-02" }, NOW);
  assert.strictEqual(p.kind, "dated");
  const days = p.at.map((d) => d.getDate());
  assert.deepStrictEqual(days, [2, 4, 6, 9, 11, 13]);
  assert.ok(p.at[0].getTime() === local(11, 2, 8));
});

t("R5 ended, or end before start: nothing is scheduled", () => {
  assert.deepStrictEqual(R.planSchedule({ daysOfWeek: EVERY_DAY, times: eight, endDate: "2026-10-24" }, NOW), { kind: "none" });
  assert.deepStrictEqual(R.planSchedule({ daysOfWeek: EVERY_DAY, times: eight, startDate: "2026-11-05", endDate: "2026-11-01" }, NOW), { kind: "none" });
  // Ends today, but today's only time has passed: dated with no alarms left.
  assert.deepStrictEqual(R.planSchedule({ daysOfWeek: EVERY_DAY, times: eight, endDate: "2026-10-25" }, NOW), { kind: "dated", at: [] });
});

t("R6 accepts ISO timestamps from the API (date part only)", () => {
  const p = R.planSchedule({ daysOfWeek: EVERY_DAY, times: eight, startDate: "2026-10-26T00:00:00.000Z", endDate: "2026-10-26T00:00:00.000Z" }, NOW);
  assert.deepStrictEqual(p.at.map((d) => d.getTime()), [local(10, 26, 8)]);
});

t("R7 list labels", () => {
  const today = "2026-10-25";
  assert.strictEqual(R.dateRangeLabel(null, null, today), null);
  assert.strictEqual(R.dateRangeLabel("2026-10-01", null, today), null);
  assert.strictEqual(R.dateRangeLabel(null, "2026-10-30", today), "Until 30 Oct");
  assert.strictEqual(R.dateRangeLabel(null, "2026-10-25", today), "Ends today");
  assert.strictEqual(R.dateRangeLabel(null, "2026-10-24", today), "Ended");
  assert.strictEqual(R.dateRangeLabel("2026-11-01", null, today), "From 1 Nov");
  assert.strictEqual(R.dateRangeLabel("2026-11-01", "2027-01-10", today), "1 Nov to 10 Jan 2027");
});

console.log(results.join("\n"));
if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} reminder schedule checks passed.`);
