// Calendar invite for a booked session (lib/ics.ts; Figma coach/08 "Add to calendar", 25 Oct 2026).
// Run from the repository root after npm ci:
//   node apps/user-mobile/tests/ics.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "ics.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, () => ({}));
const I = m.exports;

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

const NOW = new Date("2026-10-25T10:00:00.000Z");
const ev = { uid: "booking-1", title: "Fitness Coaching with Jordan Blake", start: "2026-10-27T09:00:00.000Z", durationMinutes: 45, description: "Session booked in FynroX" };

t("I1 UTC times, end = start + duration", () => {
  const ics = I.buildIcs(ev, NOW);
  assert.ok(ics.includes("DTSTART:20261027T090000Z\r\n"));
  assert.ok(ics.includes("DTEND:20261027T094500Z\r\n"));
  assert.ok(ics.includes("DTSTAMP:20261025T100000Z\r\n"));
  assert.ok(ics.includes("UID:booking-1@fynrox.com\r\n"));
});

t("I2 a calendar wrapper with CRLF line endings and a 30-minute reminder by default", () => {
  const ics = I.buildIcs(ev, NOW);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "bare LF found");
  assert.ok(ics.includes("TRIGGER:-PT30M"));
  assert.ok(!I.buildIcs({ ...ev, alarmMinutes: 0 }, NOW).includes("VALARM"));
});

t("I3 text is escaped", () => {
  assert.strictEqual(I.icsEscape("a, b; c\\d\nnext"), "a\\, b\\; c\\\\d\\nnext");
  assert.ok(I.buildIcs({ ...ev, title: "Review; form, depth" }, NOW).includes("SUMMARY:Review\\; form\\, depth"));
});

t("I4 long lines fold at 75 characters", () => {
  const folded = I.icsFold("DESCRIPTION:" + "x".repeat(200));
  const lines = folded.split("\r\n");
  assert.ok(lines.every((l) => l.length <= 75));
  assert.ok(lines.slice(1).every((l) => l.startsWith(" ")));
  assert.strictEqual(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join(""), "DESCRIPTION:" + "x".repeat(200));
});

console.log(results.join("\n"));
if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} calendar invite checks passed.`);
