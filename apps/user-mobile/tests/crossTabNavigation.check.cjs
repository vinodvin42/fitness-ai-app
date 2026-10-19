// Cross-tab navigation check (Oct 2026). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/crossTabNavigation.check.cjs
// user-mobile has no test runner, so this is a plain Node script; it exits non-zero on any failure.
//
// navigate("<Tab>", { screen: "X" }) without `initial: false` makes X the first screen of that tab's stack, so
// the tab's home (and Back) can't be reached again until the app restarts. Every such jump must pass
// `initial: false`, unless X is the tab's own home screen.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const SRC = path.join(__dirname, "..", "src");
const TABS = new Set(["Today", "Train", "Fuel", "Recover", "More"]);
const HOMES = new Set(["TodayHome", "TrainDashboard", "FuelDashboard", "RecoverHub", "MoreHub"]);

const files = [];
(function walk(dir) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(n)) files.push(p);
  }
})(SRC);

const propOf = (obj, name) =>
  obj.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === name);

let checked = 0;
const failures = [];
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  (function visit(node) {
    if (
      ts.isCallExpression(node) &&
      /(^|\.)navigate$/.test(node.expression.getText()) &&
      node.arguments.length >= 2 &&
      ts.isStringLiteral(node.arguments[0]) &&
      TABS.has(node.arguments[0].text) &&
      ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      const obj = node.arguments[1];
      const screen = propOf(obj, "screen");
      if (screen) {
        const target = ts.isPropertyAssignment(screen) && ts.isStringLiteral(screen.initializer) ? screen.initializer.text : null;
        if (!(target && HOMES.has(target))) {
          checked++;
          const initial = propOf(obj, "initial");
          const ok = initial && ts.isPropertyAssignment(initial) && initial.initializer.kind === ts.SyntaxKind.FalseKeyword;
          if (!ok) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            failures.push(`${path.relative(SRC, file)}:${line + 1} navigate("${node.arguments[0].text}", { screen: ${target ?? "…"} }) lacks initial: false`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
}

if (checked === 0) failures.push("found no cross-tab navigate calls; the pattern may have changed");
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${checked} cross-tab jumps checked, ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
