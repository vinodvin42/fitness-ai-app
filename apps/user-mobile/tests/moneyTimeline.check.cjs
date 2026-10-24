// Money timeline (Figma payments/10, 24 Oct 2026). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/moneyTimeline.check.cjs
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
const mt = load("lib/moneyTimeline.ts");

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

const buy = (id, createdAt, amountCents, refund = null) => ({
  id, purpose: "subscription", referenceId: "p", itemName: "Prime", amountCents, currency: "INR", status: "paid",
  couponCode: null, discountCents: 0, createdAt, refund, activationFailed: false,
});
const PURCHASES = [
  buy("a", "2026-10-24T05:00:00.000Z", 29900, { status: "pending", refundedCents: 29900, isPartial: false, requestedAt: "2026-10-24T06:00:00.000Z", processedAt: null }),
  buy("b", "2026-10-22T04:30:00.000Z", 177000),
  buy("c", "2026-09-26T10:00:00.000Z", 499900, { status: "processed", refundedCents: 100000, isPartial: true, requestedAt: "2026-09-30T10:00:00.000Z", processedAt: "2026-10-02T10:00:00.000Z" }),
  buy("d", "2026-09-20T10:00:00.000Z", 29900, { status: "failed", refundedCents: 0, isPartial: false, requestedAt: "2026-09-21T10:00:00.000Z", processedAt: null }),
];

t("T1 charges and refunds in one list, newest first; a refund is dated when it was processed (or requested while pending)", () => {
  assert.deepStrictEqual(
    mt.moneyTimeline(PURCHASES).map((e) => [e.key, e.at.slice(0, 10)]),
    [
      ["refund:a", "2026-10-24"],
      ["charge:a", "2026-10-24"],
      ["charge:b", "2026-10-22"],
      ["refund:c", "2026-10-02"],
      ["charge:c", "2026-09-26"],
      ["refund:d", "2026-09-21"],
      ["charge:d", "2026-09-20"],
    ],
  );
});
t("T2 amounts: a charge is its price, a refund what came back (partial 1,000; failed 0), with its status", () => {
  const byKey = Object.fromEntries(mt.moneyTimeline(PURCHASES).map((e) => [e.key, e]));
  assert.strictEqual(byKey["charge:c"].amountCents, 499900);
  assert.deepStrictEqual([byKey["refund:c"].amountCents, byKey["refund:c"].refundStatus], [100000, "processed"]);
  assert.deepStrictEqual([byKey["refund:d"].amountCents, byKey["refund:d"].refundStatus], [0, "failed"]);
  assert.strictEqual(byKey["refund:a"].refundStatus, "pending");
});
t("T3 only pending refunds are 'in progress'", () => {
  assert.deepStrictEqual(mt.refundsInProgress(PURCHASES).map((p) => p.id), ["a"]);
  assert.deepStrictEqual(mt.refundsInProgress([]), []);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
