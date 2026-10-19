// Exercise video helpers (lib/exerciseVideo.ts). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/exerciseVideo.check.cjs
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "exerciseVideo.ts"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", out)(m, m.exports, require);
const { hasExerciseVideo, creditLine, playerShape, PORTRAIT_BACKDROP } = m.exports;

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

const video = {
  url: "https://media.example.com/exercises/romanian-deadlift.mp4",
  durationSec: 14,
  credit: {
    author: "Goulart",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://wger.de/en/exercise/507/view/",
    changes: "Re-encoded and trimmed, sound removed",
  },
};

t("E1 a credited https clip plays; no video doesn't", () => {
  assert.strictEqual(hasExerciseVideo({ video }), true);
  assert.strictEqual(hasExerciseVideo({ video: null }), false);
  assert.strictEqual(hasExerciseVideo({}), false);
  assert.strictEqual(hasExerciseVideo(undefined), false);
});
t("E2 a licensed clip without its full credit is never shown", () => {
  assert.strictEqual(hasExerciseVideo({ video: { ...video, credit: { ...video.credit, sourceUrl: undefined } } }), false);
  assert.strictEqual(hasExerciseVideo({ video: { ...video, credit: { ...video.credit, licenceUrl: "http://creativecommons.org/x" } } }), false);
  assert.strictEqual(hasExerciseVideo({ video: { ...video, credit: { ...video.credit, author: " " } } }), false);
  assert.strictEqual(hasExerciseVideo({ video: { ...video, url: "http://media.example.com/a.mp4" } }), false);
  assert.strictEqual(hasExerciseVideo({ video: { ...video, durationSec: 0 } }), false);
});
t("E3 our own clip needs no links and shows no credit line", () => {
  const own = { ...video, credit: { author: "Fynrox", licence: "Own" } };
  assert.strictEqual(hasExerciseVideo({ video: own }), true);
  assert.strictEqual(creditLine(own), null);
});
t("E4 the credit line carries author, licence, both links and the changes", () => {
  assert.deepStrictEqual(creditLine(video), {
    author: "Goulart",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://wger.de/en/exercise/507/view/",
    changes: "Re-encoded and trimmed, sound removed",
  });
  assert.strictEqual(creditLine({ ...video, credit: { ...video.credit, changes: "  " } }).changes, null);
});
t("E5 portrait clips are shown whole in a 4:5 box; 16:9 is the default", () => {
  assert.deepStrictEqual(playerShape({ aspect: "9:16" }), { aspectRatio: 4 / 5, fit: "contain", backdrop: PORTRAIT_BACKDROP });
  assert.deepStrictEqual(playerShape({ aspect: "1:1" }), { aspectRatio: 1, fit: "cover" });
  assert.deepStrictEqual(playerShape({ aspect: "16:9" }), { aspectRatio: 16 / 9, fit: "cover" });
  assert.deepStrictEqual(playerShape({}), { aspectRatio: 16 / 9, fit: "cover" });
});
t("E6 a royalty-free stock clip (YMove) plays and is credited", () => {
  const ymove = {
    url: "https://media.example.com/exercises/face-pull.mp4",
    durationSec: 18,
    aspect: "9:16",
    posterUrl: "https://media.example.com/exercises/posters/face-pull.jpg",
    credit: {
      author: "Your Move",
      licence: "Royalty-free",
      licenceUrl: "https://ymove.app/free-exercise-videos",
      sourceUrl: "https://ymove.app/free-exercise-videos",
      changes: "Sound and metadata removed",
    },
  };
  assert.strictEqual(hasExerciseVideo({ video: ymove }), true);
  assert.strictEqual(creditLine(ymove).licence, "Royalty-free");
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
