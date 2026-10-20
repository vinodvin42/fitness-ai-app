// Sign-in / sign-up error text (lib/authErrors.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/authErrors.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "authErrors.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { authErrorMessage: msg } = m.exports;

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
const api = (status, error) => ({ isAxiosError: true, response: { status, data: error ? { error } : "<html>Site Disabled</html>" } });

t("A1 offline / no response never blames the email", () => {
  assert.match(msg({ isAxiosError: true, code: "ERR_NETWORK" }, "signup"), /Can't reach Fynrox/);
  assert.match(msg({ isAxiosError: true }, "login"), /Can't reach Fynrox/);
});

t("A2 the hosting error pages of the 20 Oct outage (403 / 404 HTML) read as 'having trouble'", () => {
  assert.match(msg(api(403), "signup"), /having trouble/);
  assert.match(msg(api(404), "login"), /having trouble/);
  assert.match(msg(api(500, { code: "internal_error", message: "x" }), "signup"), /having trouble/);
});

t("A3 the real duplicate-email and wrong-password answers", () => {
  assert.strictEqual(msg(api(409, { code: "email_taken", message: "An account with this email already exists" }), "signup"), "An account with this email already exists. Log in instead.");
  assert.strictEqual(msg(api(401, { code: "invalid_credentials", message: "Incorrect email or password" }), "login"), "Incorrect email or password.");
});

t("A4 too many attempts", () => {
  assert.match(msg(api(429, { code: "too_many_requests", message: "Too many attempts — try again in a few minutes" }), "login"), /Too many attempts/);
});

t("A5 validation shows the first field's problem", () => {
  const e = api(400, { code: "validation_error", message: "Invalid request body", details: { fieldErrors: { password: ["String must contain at least 8 character(s)"] } } });
  assert.strictEqual(msg(e, "signup"), "Password: String must contain at least 8 character(s)");
});

t("A6 anything else shows the server's own message", () => {
  assert.strictEqual(msg(api(403, { code: "account_suspended", message: "This account is suspended" }), "login"), "This account is suspended");
  assert.match(msg(new Error("boom"), "login"), /Something went wrong/);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
