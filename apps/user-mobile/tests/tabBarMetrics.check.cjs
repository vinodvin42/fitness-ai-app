// Inset-aware tab bar (Oct 2026). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/tabBarMetrics.check.cjs
// Checks the pure size rule in src/navigation/tabBarMetrics.ts, and that MainTabs uses it instead of a fixed height.
// Real insets and the rendered bar are covered by device row N11, not here.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const src = (rel) => fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8");
const js = ts.transpileModule(src("navigation/tabBarMetrics.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, require);
const { TAB_BAR_CONTENT_HEIGHT, tabBarBottomPadding } = m.exports;
const results = []; let failures = 0;
const check = (label, actual, expected) => { const ok = actual === expected; if (!ok) failures++; results.push(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`); };
// [bottom inset, OS, expected padding]
for (const [inset, os, expected, label] of [
  [0, "android", 10, "Android without inset keeps 70 / 10"],
  [0, "ios", 10, "iPhone without home indicator keeps 70 / 10"],
  [24, "android", 24, "Android gesture bar (edge-to-edge, 24dp)"],
  [48, "android", 48, "Android 3-button bar (edge-to-edge, 48dp)"],
  [34, "ios", 30, "iPhone home indicator (34pt; bottom-tabs' own rule, inset − 4)"],
  [12, "ios", 10, "small inset never below the old 10"],
]) check(`${label}: padding`, tabBarBottomPadding(inset, os), expected);
check("content row height", TAB_BAR_CONTENT_HEIGHT, 60);
const mainTabs = src("navigation/MainTabs.tsx");
check("MainTabs uses tabBarBottomPadding with the safe-area inset", /tabBarBottomPadding\(useSafeAreaInsets\(\)\.bottom, Platform\.OS\)/.test(mainTabs), true);
check("MainTabs has no fixed tab bar height or bottom padding", /height:\s*70\b|paddingBottom:\s*10\b/.test(mainTabs), false);
console.log(results.join("\n"));
console.log(failures ? `${failures} failure(s)` : `${results.length}/${results.length} passed`);
process.exitCode = failures ? 1 : 0;
