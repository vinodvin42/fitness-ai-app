// Separates pre-existing test failures from new ones by comparing two
// Vitest JUnit files (branch vs main). Used by verify-batch0.ps1.
//
//   node scripts/local-verify/junit-compare.mjs <branch.xml> <main.xml> <out.txt>
//
// Exit code: 0 = no new failures, 1 = new failures on the branch,
// 4 = a results file is missing (never treated as a pass).
import fs from "node:fs";

const [branchPath, mainPath, outPath] = process.argv.slice(2);

function parse(file) {
  if (!file || !fs.existsSync(file)) return null;
  const xml = fs.readFileSync(file, "utf8");
  const cases = new Map();
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const body = m[3] ?? "";
    const cls = /classname="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const status = /<(failure|error)\b/.test(body) ? "failed" : /<skipped\b/.test(body) ? "skipped" : "passed";
    cases.set(`${cls} > ${name}`, status);
  }
  return cases;
}

const branch = parse(branchPath);
const main = parse(mainPath);
const lines = [];
if (!branch || !main) {
  lines.push(`Missing results: branch=${branch ? "present" : "MISSING"}, main=${main ? "present" : "MISSING"}.`);
  lines.push("A missing results file is not a pass. No comparison was made.");
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  process.exit(4);
}

const failed = (map) => [...map].filter(([, s]) => s === "failed").map(([k]) => k);
const branchFailed = failed(branch);
const mainFailed = new Set(failed(main));
const newFailures = branchFailed.filter((k) => !mainFailed.has(k));
const preExisting = branchFailed.filter((k) => mainFailed.has(k));
const fixed = [...mainFailed].filter((k) => branch.get(k) === "passed");

lines.push(`Branch: ${branch.size} tests, ${branchFailed.length} failed.  Main: ${main.size} tests, ${mainFailed.size} failed.`);
lines.push("");
lines.push(`NEW failures on the branch (regressions or new tests failing) (${newFailures.length}):`);
newFailures.forEach((k) => lines.push(`  ! ${k}`));
lines.push("");
lines.push(`Pre-existing failures (also failing on main) (${preExisting.length}):`);
preExisting.forEach((k) => lines.push(`  = ${k}`));
lines.push("");
lines.push(`Fixed on the branch (failing on main, passing here) (${fixed.length}):`);
fixed.forEach((k) => lines.push(`  + ${k}`));
fs.writeFileSync(outPath, lines.join("\n") + "\n");
console.log(lines.join("\n"));
process.exit(newFailures.length > 0 ? 1 : 0);
