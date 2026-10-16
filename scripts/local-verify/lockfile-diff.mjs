// Compares two package-lock.json files (lockfileVersion 3) and explains
// every package change. Used by verify-batch0.ps1.
//
//   node scripts/local-verify/lockfile-diff.mjs <before.json> <after.json> <out.txt>
//
// Exit codes: 0 = only additions/removals, 2 = an existing package changed
// version (needs investigation), 3 = a protected package changed (Expo,
// React Native, React) — the run must stop.
import fs from "node:fs";

const [beforePath, afterPath, outPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !outPath) {
  console.error("usage: lockfile-diff.mjs <before.json> <after.json> <out.txt>");
  process.exit(64);
}
const before = JSON.parse(fs.readFileSync(beforePath, "utf8")).packages ?? {};
const after = JSON.parse(fs.readFileSync(afterPath, "utf8")).packages ?? {};
const PROTECTED = /(^|node_modules\/)(expo|react-native|react|react-dom|@expo\/cli|metro)$/;

const added = [];
const removed = [];
const changed = [];
for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (key === "") continue; // root entry
  const b = before[key];
  const a = after[key];
  if (!b && a) added.push(`${key}@${a.version ?? "(workspace)"}`);
  else if (b && !a) removed.push(`${key}@${b.version ?? "(workspace)"}`);
  else if (b.version !== a.version) changed.push({ key, from: b.version, to: a.version, protected: PROTECTED.test(key) });
}

// Workspace manifests inside the lockfile (dependency ranges declared by each app).
const manifestChanges = [];
for (const key of Object.keys(after)) {
  if (key.startsWith("node_modules/") || !before[key]) continue;
  for (const field of ["dependencies", "devDependencies"]) {
    const b = before[key][field] ?? {};
    const a = after[key][field] ?? {};
    for (const dep of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (b[dep] !== a[dep]) manifestChanges.push(`${key || "(root)"} ${field}.${dep}: ${b[dep] ?? "-"} -> ${a[dep] ?? "-"}`);
    }
  }
}

const lines = [];
lines.push(`Lockfile comparison: ${beforePath} -> ${afterPath}`);
lines.push("");
lines.push(`Declared dependency changes in workspace manifests (${manifestChanges.length}):`);
manifestChanges.forEach((l) => lines.push(`  ${l}`));
lines.push("");
lines.push(`Packages added (${added.length}):`);
added.sort().forEach((l) => lines.push(`  + ${l}`));
lines.push("");
lines.push(`Packages removed (${removed.length}):`);
removed.sort().forEach((l) => lines.push(`  - ${l}`));
lines.push("");
lines.push(`Existing packages that changed version (${changed.length}) - each needs an explanation:`);
changed.forEach((c) => lines.push(`  ~ ${c.key}: ${c.from} -> ${c.to}${c.protected ? "   <-- PROTECTED (Expo/React Native/React): not allowed" : ""}`));
fs.writeFileSync(outPath, lines.join("\n") + "\n");
console.log(lines.join("\n"));

if (changed.some((c) => c.protected)) process.exit(3);
if (changed.length > 0) process.exit(2);
process.exit(0);
