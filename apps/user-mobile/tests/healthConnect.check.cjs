// Health Connect day mapping (lib/healthConnect.ts; owner, 24 Oct 2026: "Wearables: Health Connect (Android)").
// Run from the repository root after npm ci:
//   node apps/user-mobile/tests/healthConnect.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure. The native module and the API
// client are stubbed: only the pure day windows and sample mapping are checked, against the ranges in
// apps/api/src/modules/devices/devices.schema.ts (syncSampleSchema). Runs in the machine's time zone, so every
// timestamp below is built from local dates.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "healthConnect.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const stub = (name) => (name === "react-native" ? { Platform: { OS: "web" }, Linking: {} } : {});
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, stub);
const { lastDays, localDay, buildSyncSamples, sleepHoursByWakeDay, statusFromSdk, findHealthConnectDevice, HEALTH_CONNECT_RECORDS } = m.exports;

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

// Local times on 20-24 Oct 2026.
const at = (day, h, min = 0) => new Date(2026, 9, day, h, min).toISOString();
const D = (day) => `2026-10-${String(day).padStart(2, "0")}`;

t("H1 lastDays: oldest first, ends today, local midnights", () => {
  const days = lastDays(3, new Date(2026, 9, 24, 15, 30));
  assert.deepStrictEqual(days.map((d) => d.date), [D(22), D(23), D(24)]);
  assert.strictEqual(days[0].start, new Date(2026, 9, 22).toISOString());
  assert.strictEqual(days[2].end, new Date(2026, 9, 25).toISOString());
  assert.strictEqual(lastDays(500).length, 90, "the API takes at most 90 samples");
  assert.strictEqual(lastDays(0).length, 1);
});

t("H2 steps and active calories come straight from the per-day aggregates, rounded", () => {
  const samples = buildSyncSamples([D(23), D(24)], { steps: { [D(23)]: 8042, [D(24)]: 1200.6 }, activeCalories: { [D(23)]: 412.4 } });
  assert.deepStrictEqual(samples, [
    { date: D(23), steps: 8042, activeCalories: 412 },
    { date: D(24), steps: 1201 },
  ]);
});

t("H3 resting HR, HRV and SpO2 are each day's mean; weight is the day's latest reading", () => {
  const [s] = buildSyncSamples([D(24)], {
    restingHr: [{ time: at(24, 7), bpm: 58 }, { time: at(24, 22), bpm: 61 }],
    hrv: [{ time: at(24, 3), ms: 40 }, { time: at(24, 4), ms: 51 }],
    spo2: [{ time: at(24, 2), percent: 96.2 }, { time: at(24, 3), percent: 97.9 }],
    weight: [{ time: at(24, 7), kg: 72.44 }, { time: at(24, 21), kg: 72.96 }, { time: at(23, 23), kg: 80 }],
  });
  assert.deepStrictEqual(s, { date: D(24), restingHr: 60, hrvMs: 46, spo2: 97, weightKg: 73 });
});

t("H4 a night counts on the day you woke up", () => {
  const hours = sleepHoursByWakeDay([{ startTime: at(23, 23), endTime: at(24, 6, 30) }]);
  assert.deepStrictEqual([...hours], [[D(24), 7.5]]);
});

t("H5 the same night from two apps is merged, not doubled; a nap adds", () => {
  const hours = sleepHoursByWakeDay([
    { startTime: at(23, 23), endTime: at(24, 6) }, // watch app
    { startTime: at(23, 23, 30), endTime: at(24, 6, 30) }, // phone app, overlapping
    { startTime: at(24, 14), endTime: at(24, 14, 45) }, // nap
  ]);
  assert.strictEqual(hours.get(D(24)), 8.25);
});

t("H6 values outside the API's ranges are dropped, not clamped (one bad value would fail the whole sync)", () => {
  const samples = buildSyncSamples([D(24)], {
    steps: { [D(24)]: 250000 },
    activeCalories: { [D(24)]: -5 },
    restingHr: [{ time: at(24, 7), bpm: 15 }],
    hrv: [{ time: at(24, 3), ms: 900 }],
    spo2: [{ time: at(24, 3), percent: 40 }],
    weight: [{ time: at(24, 7), kg: 0 }],
    sleep: [{ startTime: at(22, 6), endTime: at(24, 6) }], // 48 h
  });
  assert.deepStrictEqual(samples, []);
});

t("H7 days with nothing to send are left out; duplicates and order are normalised", () => {
  const samples = buildSyncSamples([D(24), D(22), D(24), D(23)], { steps: { [D(22)]: 10 } });
  assert.deepStrictEqual(samples, [{ date: D(22), steps: 10 }]);
});

t("H8 sleep hours keep two decimals; readings on days outside the window are ignored", () => {
  const samples = buildSyncSamples([D(24)], {
    sleep: [{ startTime: at(23, 23, 10), endTime: at(24, 6, 0) }],
    restingHr: [{ time: at(20, 7), bpm: 70 }],
  });
  assert.deepStrictEqual(samples, [{ date: D(24), sleepHours: 6.83 }]);
});

t("H9 SDK status codes and the device we pair", () => {
  assert.strictEqual(statusFromSdk(3), "available");
  assert.strictEqual(statusFromSdk(2), "update_required");
  assert.strictEqual(statusFromSdk(1), "unavailable");
  const devices = [
    { id: "a", provider: "health_connect", name: "Samsung Galaxy Watch" },
    { id: "b", provider: "health_connect", name: "Health Connect" },
  ];
  assert.strictEqual(findHealthConnectDevice(devices).id, "b", "a hand-added watch on Health Connect is not the sync device");
  assert.strictEqual(HEALTH_CONNECT_RECORDS.length, 7);
});

t("H10 localDay uses the phone's calendar day", () => {
  assert.strictEqual(localDay(new Date(2026, 9, 24, 0, 5)), D(24));
  assert.strictEqual(localDay(new Date(2026, 9, 24, 23, 55).toISOString()), D(24));
});

t("H11 background sync runs at most every 3 hours (lib/useHealthConnect.ts)", () => {
  const hookSrc = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "useHealthConnect.ts"), "utf8");
  const hookOut = ts.transpileModule(hookSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const hm = { exports: {} };
  new Function("module", "exports", "require", hookOut)(hm, hm.exports, () => ({}));
  const { autoSyncDue, AUTO_SYNC_EVERY_MS } = hm.exports;
  const nowMs = Date.UTC(2026, 9, 24, 12);
  assert.strictEqual(AUTO_SYNC_EVERY_MS, 3 * 3_600_000);
  assert.strictEqual(autoSyncDue(null, nowMs), true, "never synced");
  assert.strictEqual(autoSyncDue(nowMs - 2 * 3_600_000, nowMs), false);
  assert.strictEqual(autoSyncDue(nowMs - 3 * 3_600_000, nowMs), true);
  assert.strictEqual(autoSyncDue(nowMs + 60_000, nowMs), true, "a clock moved backwards doesn't block syncing");
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
