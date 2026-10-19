// Recipe video helpers (lib/recipeVideo.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/recipeVideo.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "recipeVideo.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { hasVideo, stepClip, clipAction, clipLengthLabel } = m.exports;

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

// The spec's example shot list (rec-eggs-spinach, 35 s, steps at 0:02 / 0:08 / 0:18).
const video = {
  url: "https://media.example.com/recipes/eggs-spinach.mp4",
  durationSec: 35,
  steps: [
    { step: 1, startSec: 2 },
    { step: 2, startSec: 8 },
    { step: 3, startSec: 18 },
  ],
};

t("V1 hasVideo: only an https link with a length counts", () => {
  assert.strictEqual(hasVideo({ video }), true);
  assert.strictEqual(hasVideo({ video: null }), false);
  assert.strictEqual(hasVideo({}), false);
  assert.strictEqual(hasVideo(undefined), false);
  assert.strictEqual(hasVideo({ video: { ...video, url: "http://media.example.com/a.mp4" } }), false);
  assert.strictEqual(hasVideo({ video: { ...video, url: "  " } }), false);
  assert.strictEqual(hasVideo({ video: { ...video, durationSec: 0 } }), false);
});
t("V2 stepClip runs from a step's marker to the next marker, the last to the end", () => {
  assert.deepStrictEqual(stepClip(video, 0), { startSec: 2, endSec: 8 });
  assert.deepStrictEqual(stepClip(video, 1), { startSec: 8, endSec: 18 });
  assert.deepStrictEqual(stepClip(video, 2), { startSec: 18, endSec: 35 });
});
t("V3 a step without a marker (or no video) has no clip; a skipped step doesn't shorten the one before", () => {
  const gap = { ...video, steps: [video.steps[0], video.steps[2]] };
  assert.strictEqual(stepClip(gap, 1), null);
  assert.deepStrictEqual(stepClip(gap, 0), { startSec: 2, endSec: 18 });
  assert.strictEqual(stepClip(video, 3), null);
  assert.strictEqual(stepClip(null, 0), null);
  assert.strictEqual(stepClip({ ...video, steps: [] }, 0), null);
});
t("V4 markers out of order still map by step number", () => {
  const shuffled = { ...video, steps: [video.steps[2], video.steps[0], video.steps[1]] };
  assert.deepStrictEqual(stepClip(shuffled, 1), { startSec: 8, endSec: 18 });
});
t("V5 clipAction loops or stops at the clip end, carries on inside it", () => {
  const clip = { startSec: 8, endSec: 18 };
  assert.strictEqual(clipAction(9000, clip, true), "continue");
  assert.strictEqual(clipAction(2000, clip, true), "continue");
  assert.strictEqual(clipAction(18000, clip, true), "restart");
  assert.strictEqual(clipAction(18250, clip, false), "pause");
  assert.strictEqual(clipAction(40000, null, true), "continue");
});
t("V6 clipLengthLabel", () => {
  assert.strictEqual(clipLengthLabel(6), "0:06");
  assert.strictEqual(clipLengthLabel(35), "0:35");
  assert.strictEqual(clipLengthLabel(75.4), "1:15");
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
