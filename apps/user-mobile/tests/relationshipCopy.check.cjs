// Coaching hub copy (Figma Professional 05b/06/12). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/relationshipCopy.check.cjs
// GET /coaching/relationships/status returns every relationship that isn't "ended", so each such status needs a
// sentence in en.ts — otherwise the hub shows a raw key like "coaching.relationship.status.completed".
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

const root = path.join(__dirname, "..", "..", "..");
const typesSrc = fs.readFileSync(path.join(root, "packages", "types", "src", "index.ts"), "utf8");
const union = /export type RelationshipStatus =([^;]+);/.exec(typesSrc)[1];
const statuses = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).filter((s) => s !== "ended");

const enSrc = fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "locales", "en.ts"), "utf8");
const m = { exports: {} };
new Function("module", "exports", "require", ts.transpileModule(enSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports, require);
const rel = m.exports.en.coaching.relationship;

const screen = fs.readFileSync(path.join(__dirname, "..", "src", "screens", "coaching", "ProfessionalRelationshipScreen.tsx"), "utf8");
const noteKeys = [...screen.matchAll(/"coaching\.relationship\.([A-Za-z]+)"/g)].map((x) => x[1]);

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

t(`R1 every non-ended RelationshipStatus (${statuses.length}) has status copy`, () => {
  const missing = statuses.filter((s) => typeof rel.status[s] !== "string" || !rel.status[s]);
  assert.deepStrictEqual(missing, []);
});
t("R2 every coaching.relationship.* key the hub screen uses exists in en.ts", () => {
  const missing = noteKeys.filter((k) => typeof rel[k] !== "string");
  assert.deepStrictEqual(missing, []);
});
t("R3 the stepper's main-path steps all have a label", () => {
  for (const s of ["requested", "accepted", "awaiting_payment", "activating", "active"]) assert.ok(rel.step[s], s);
});

console.log(results.join("\n"));
console.log(`${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
