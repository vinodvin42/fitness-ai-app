// Android Today widget snapshot and view (lib/todayWidget.ts; Figma widgets/02-android). Run from the repository
// root after npm ci:
//   node apps/user-mobile/tests/todayWidget.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure. AsyncStorage and the unit
// helpers' app imports are stubbed; hydration.ts is the real file.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const compile = (rel, req) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, req);
  return m.exports;
};
const measureUnits = { mlToOz: (ml) => ml / 29.5735295625 };
const hydration = compile("lib/hydration.ts", (name) => (name === "./measureUnits" ? measureUnits : {}));
const storage = new Map();
const AsyncStorage = {
  getItem: async (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: async (k, v) => void storage.set(k, v),
  removeItem: async (k) => void storage.delete(k),
};
const w = compile("lib/todayWidget.ts", (name) =>
  name === "./hydration" ? hydration : name === "./measureUnits" ? measureUnits : name === "@react-native-async-storage/async-storage" ? { default: AsyncStorage } : {},
);

const results = [];
let failures = 0;
const t = async (name, fn) => {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (e) {
    failures++;
    results.push(`FAIL  ${name}\n      ${e.message}`);
  }
};

const now = new Date(2026, 9, 24, 9, 41);
const base = {
  now,
  nextWorkoutName: "Upper Body Strength",
  programComplete: false,
  inProgressName: null,
  completedName: null,
  isRestDay: false,
  workoutTime: "6:00 PM",
  waterGlasses: 7,
  waterGoalGlasses: 8,
  waterUnit: "ml",
  proteinLeftG: 78,
  proteinTargetG: 150,
};

(async () => {
  await t("W1 the Figma rows: workout · time, water so far / goal, protein left", () => {
    const view = w.todayWidgetView(w.buildTodayWidgetSnapshot(base), now);
    assert.deepStrictEqual(view.rows, [
      { label: "Workout", value: "Upper Body Strength · 6:00 PM" },
      { label: "Water", value: "1.75 / 2 L" },
      { label: "Protein", value: "78 g left of 150 g" },
    ]);
    assert.strictEqual(view.quickAdd, "+250 ml");
    assert.strictEqual(view.note, null);
  });

  await t("W2 workout state follows Today: in progress, then done, then rest day, then plan", () => {
    const value = (over) => w.todayWidgetView(w.buildTodayWidgetSnapshot({ ...base, ...over }), now).rows[0].value;
    assert.strictEqual(value({ inProgressName: "Legs", completedName: "Arms", isRestDay: true }), "Legs · in progress");
    assert.strictEqual(value({ completedName: "Arms", isRestDay: true }), "Done: Arms");
    assert.strictEqual(value({ isRestDay: true }), "Rest day");
    assert.strictEqual(value({ workoutTime: null }), "Upper Body Strength");
    assert.strictEqual(value({ nextWorkoutName: null, programComplete: true }), "Program finished · pick the next one");
    assert.strictEqual(value({ nextWorkoutName: null }), "No workout planned");
  });

  await t("W3 ounces, protein reached, and numbers rounded / never negative", () => {
    const view = w.todayWidgetView(w.buildTodayWidgetSnapshot({ ...base, waterUnit: "oz", proteinLeftG: -12.4, waterGlasses: -1 }), now);
    assert.strictEqual(view.rows[1].value, "0 / 68 oz");
    assert.strictEqual(view.rows[2].value, "Goal reached · 150 g");
    assert.strictEqual(view.quickAdd, "+8 oz");
  });

  await t("W4 yesterday's snapshot never shows yesterday's numbers", () => {
    const old = w.buildTodayWidgetSnapshot({ ...base, now: new Date(2026, 9, 23, 22, 0) });
    const view = w.todayWidgetView(old, now);
    assert.deepStrictEqual(view.rows.map((r) => r.value), ["Open Fynrox for today's plan", "— / 2 L", "—"]);
    assert.strictEqual(view.quickAdd, null, "no +250 ml on a stale day");
    assert.strictEqual(view.note, "Open Fynrox to update");
  });

  await t("W5 no snapshot (signed out / never opened): prompt, no button; a tap notice shows in the header", () => {
    const view = w.todayWidgetView(null, now);
    assert.strictEqual(view.rows[0].value, "Open Fynrox to see today");
    assert.strictEqual(view.quickAdd, null);
    assert.strictEqual(w.todayWidgetView(w.buildTodayWidgetSnapshot(base), now, "Couldn't log · open Fynrox").note, "Couldn't log · open Fynrox");
  });

  await t("W6 workout time: earliest enabled workout reminder for today's weekday", () => {
    const fmt = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    const sat = now.getDay();
    const reminders = [
      { category: "workout", hour: 18, minute: 0, daysOfWeek: [sat], isEnabled: true },
      { category: "workout", hour: 7, minute: 30, daysOfWeek: [sat], isEnabled: false },
      { category: "workout", hour: 6, minute: 15, daysOfWeek: [(sat + 1) % 7], isEnabled: true },
      { category: "water", hour: 5, minute: 0, daysOfWeek: [sat], isEnabled: true },
      { category: "workout", hour: 17, minute: 45, daysOfWeek: [sat], isEnabled: true },
    ];
    assert.strictEqual(w.workoutReminderTime(reminders, now, fmt), "17:45");
    assert.strictEqual(w.workoutReminderTime([], now, fmt), null);
    assert.strictEqual(w.workoutReminderTime(undefined, now, fmt), null);
  });

  await t("W7 todayWorkoutState: today's open session, else today's latest finished one, else rest day", () => {
    const h = (status, workoutName, startedAt, completedAt = null) => ({ status, workoutName, startedAt, completedAt });
    const today = (hr) => new Date(2026, 9, 24, hr).toISOString();
    const yesterday = new Date(2026, 9, 23, 8).toISOString();
    assert.deepStrictEqual(w.todayWorkoutState([h("in_progress", "Legs", today(8)), h("completed", "Arms", today(6), today(7))], ["mon"], now), {
      inProgressName: "Legs",
      completedName: "Arms",
      isRestDay: false,
    });
    assert.deepStrictEqual(w.todayWorkoutState([h("in_progress", "Old", yesterday)], ["mon"], now), { inProgressName: null, completedName: null, isRestDay: true });
    assert.strictEqual(w.todayWorkoutState([], ["sat"], now).isRestDay, false);
    assert.strictEqual(w.todayWorkoutState([], [], now).isRestDay, false, "no training days set = no rest-day claim");
  });

  await t("W8 the change key ignores the timestamp; storage round-trips and clears", async () => {
    const a = w.buildTodayWidgetSnapshot(base);
    const b = w.buildTodayWidgetSnapshot({ ...base, now: new Date(now.getTime() + 60_000) });
    assert.strictEqual(w.snapshotKey(a), w.snapshotKey(b));
    assert.notStrictEqual(w.snapshotKey(a), w.snapshotKey(w.buildTodayWidgetSnapshot({ ...base, waterGlasses: 8 })));
    await w.writeTodayWidgetSnapshot(a);
    assert.deepStrictEqual(await w.readTodayWidgetSnapshot(), a);
    await w.deleteTodayWidgetSnapshot();
    assert.strictEqual(await w.readTodayWidgetSnapshot(), null);
    storage.set(w.TODAY_WIDGET_STORAGE_KEY, "{not json");
    assert.strictEqual(await w.readTodayWidgetSnapshot(), null);
  });

  console.log(results.join("\n"));
  console.log(`${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();
