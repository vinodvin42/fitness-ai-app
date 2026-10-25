// Coach request helpers (lib/coachRequest.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/coachRequest.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");
const load = (rel) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
};
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

const { REQUEST_REPLY_HOURS, localDateKey, upcomingDays, formatPreferredDay, preferredDayForBooking } = load("lib/coachRequest.ts");

t("the reply window words as 48 hours, like the API's REQUEST_REPLY_WINDOW_MS", () => {
  assert.strictEqual(REQUEST_REPLY_HOURS, 48);
  const api = fs.readFileSync(path.join(__dirname, "..", "..", "api", "src", "lib", "relationshipActivation.ts"), "utf8");
  assert.ok(api.includes("REQUEST_REPLY_WINDOW_MS = 48 * 60 * 60 * 1000"), "the API window changed; update REQUEST_REPLY_HOURS");
});

t("localDateKey is the member's own calendar day, zero padded", () => {
  assert.strictEqual(localDateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.strictEqual(localDateKey(new Date(2026, 9, 25, 0, 1)), "2026-10-25");
});

t("upcomingDays starts today and crosses a month end", () => {
  const days = upcomingDays(4, new Date(2026, 9, 30, 15, 0));
  assert.deepStrictEqual(days.map((d) => d.key), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
});

t("formatPreferredDay reads the stored UTC day without sliding", () => {
  const text = formatPreferredDay("2026-10-27T00:00:00.000Z", "en-IN");
  assert.ok(/27/.test(text) && /Oct/.test(text) && /Tue/.test(text), `unexpected: ${text}`);
});

t("preferredDayForBooking keeps today or later and drops a past day", () => {
  const today = new Date(2026, 9, 25, 10, 0);
  assert.strictEqual(preferredDayForBooking("2026-10-27T00:00:00.000Z", today), "2026-10-27");
  assert.strictEqual(preferredDayForBooking("2026-10-25T00:00:00.000Z", today), "2026-10-25");
  assert.strictEqual(preferredDayForBooking("2026-10-20T00:00:00.000Z", today), null);
  assert.strictEqual(preferredDayForBooking(null, today), null);
});

console.log(results.join("\n"));
console.log(failures === 0 ? `\nAll ${results.length} checks passed.` : `\n${failures} of ${results.length} failed.`);
process.exit(failures === 0 ? 0 : 1);
