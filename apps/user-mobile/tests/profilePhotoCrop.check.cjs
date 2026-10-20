// Profile photo crop and resize (lib/profilePhotoCrop.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/profilePhotoCrop.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "profilePhotoCrop.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { squarePhotoActions: actions, PROFILE_PHOTO_SIZE } = m.exports;

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

t("P1 a 4000x3000 camera photo: centre square, then 512 px", () => {
  assert.deepStrictEqual(actions(4000, 3000), [
    { crop: { originX: 500, originY: 0, width: 3000, height: 3000 } },
    { resize: { width: 512, height: 512 } },
  ]);
});

t("P2 a portrait photo crops from the middle", () => {
  assert.deepStrictEqual(actions(1080, 1921)[0], { crop: { originX: 0, originY: 420, width: 1080, height: 1080 } });
});

t("P3 the picker's own square crop is only shrunk", () => {
  assert.deepStrictEqual(actions(2048, 2048), [{ resize: { width: 512, height: 512 } }]);
});

t("P4 a small square image is left alone (never enlarged)", () => {
  assert.deepStrictEqual(actions(400, 400), []);
  assert.deepStrictEqual(actions(512, 512), []);
});

t("P5 unknown dimensions still end up 512 px square", () => {
  assert.deepStrictEqual(actions(0, 0), [{ resize: { width: 512, height: 512 } }]);
  assert.strictEqual(PROFILE_PHOTO_SIZE, 512);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
