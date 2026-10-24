// Offline start-up: only a real refusal signs out (24 Oct 2026). Run from the repository root:
//   node apps/user-mobile/tests/cachedMe.check.cjs
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "cachedMe.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
const store = new Map();
const asyncStorage = {
  setItem: async (k, v) => void store.set(k, v),
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  removeItem: async (k) => void store.delete(k),
};
const stub = (name) => (name === "@react-native-async-storage/async-storage" ? { __esModule: true, default: asyncStorage } : {});
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, stub);
const c = m.exports;

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

(async () => {
  await t("A1 only 401/403 from the server count as a refusal", async () => {
    assert.strictEqual(c.isAuthRejection({ response: { status: 401 } }), true);
    assert.strictEqual(c.isAuthRejection({ response: { status: 403 } }), true);
    assert.strictEqual(c.isAuthRejection({ response: { status: 500 } }), false);
    assert.strictEqual(c.isAuthRejection({ message: "Network Error" }), false);
    assert.strictEqual(c.isAuthRejection(null), false);
  });
  await t("A2 the saved member round-trips, and a bad entry reads as none", async () => {
    await c.saveCachedMe({ user: { id: "u1", fullName: "A" }, onboardingCompleted: true });
    assert.deepStrictEqual(await c.loadCachedMe(), { user: { id: "u1", fullName: "A" }, onboardingCompleted: true });
    store.set("fynrox.cachedMe.v1", "{not json");
    assert.strictEqual(await c.loadCachedMe(), null);
    store.set("fynrox.cachedMe.v1", JSON.stringify({ onboardingCompleted: true }));
    assert.strictEqual(await c.loadCachedMe(), null);
  });
  await t("A3 sign-out clears it", async () => {
    await c.saveCachedMe({ user: { id: "u2" }, onboardingCompleted: false });
    await c.clearCachedMe();
    assert.strictEqual(await c.loadCachedMe(), null);
  });
  console.log(results.join("\n"));
  console.log(`${results.length - failures}/${results.length} passed`);
  process.exit(failures ? 1 : 0);
})();
