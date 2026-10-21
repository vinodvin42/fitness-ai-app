// UPI app links in the Razorpay sheet (lib/paymentLinks.ts) open outside the WebView. Run from the repository root after npm ci:
//   node apps/user-mobile/tests/paymentLinks.check.cjs
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

const { externalPaymentUrl } = load("lib/paymentLinks.ts");

t("U1 web pages stay in the WebView", () => {
  for (const url of ["https://checkout.razorpay.com/v1/checkout.js", "http://localhost", "about:blank", "data:text/html,x"]) {
    assert.strictEqual(externalPaymentUrl(url), null, url);
  }
});

t("U2 upi:// and app schemes are handed to the phone as they are", () => {
  const upi = "upi://pay?pa=merchant@razorpay&pn=Fynrox&am=299.00&cu=INR";
  assert.strictEqual(externalPaymentUrl(upi), upi);
  assert.strictEqual(externalPaymentUrl("tez://upi/pay?pa=x"), "tez://upi/pay?pa=x");
});

t("U3 Android intent:// links become their scheme's URL", () => {
  assert.strictEqual(
    externalPaymentUrl("intent://pay?pa=merchant@razorpay&am=299.00#Intent;scheme=upi;package=com.phonepe.app;end"),
    "upi://pay?pa=merchant@razorpay&am=299.00",
  );
  assert.strictEqual(externalPaymentUrl("intent://pay?pa=x#Intent;package=com.x;end"), null);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
