// Indian-language catalogues (25 Oct 2026): every locale file in src/i18n/locales must have exactly the keys
// of en.ts, the same {{placeholders}} in each string, and no empty strings.
// Run from the repository root after npm ci:
//   node apps/user-mobile/tests/i18n-locales.check.cjs [hi ta ...]
// Plain Node script (user-mobile has no test runner); exits non-zero on any failure.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const DIR = path.join(__dirname, "..", "src", "i18n", "locales");

function load(code) {
  const src = fs.readFileSync(path.join(DIR, `${code}.ts`), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, () => ({}));
  const value = m.exports[code];
  if (!value) throw new Error(`${code}.ts doesn't export const ${code}`);
  return value;
}

function flatten(obj, prefix = "", into = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") into[key] = v;
    else flatten(v, key, into);
  }
  return into;
}

// Each language's own script block. Anything else outside ASCII, punctuation, symbols and the joiners is a
// typo from another script (found once: Thai letters inside a Malayalam word).
const SCRIPTS = {
  hi: [0x0900, 0x097f], mr: [0x0900, 0x097f], bn: [0x0980, 0x09ff], pa: [0x0a00, 0x0a7f], gu: [0x0a80, 0x0aff],
  ta: [0x0b80, 0x0bff], te: [0x0c00, 0x0c7f], kn: [0x0c80, 0x0cff], ml: [0x0d00, 0x0d7f],
};
const allowedChar = (code, cp) =>
  cp < 0x0250 || // ASCII and Latin (brand names, units)
  (cp >= 0x2000 && cp <= 0x2bff) || // punctuation, ₹, arrows, ✦ ✓ and other symbols
  cp === 0x00b7 || cp === 0xfe0f ||
  (SCRIPTS[code] && cp >= SCRIPTS[code][0] && cp <= SCRIPTS[code][1]) ||
  (code !== "en" && cp >= 0x0964 && cp <= 0x0965); // danda, shared by the Indic scripts
const foreign = (code, s) => [...s].filter((ch) => !allowedChar(code, ch.codePointAt(0)));

const placeholders = (s) => (s.match(/\{\{\s*[\w.]+\s*\}\}/g) || []).map((p) => p.replace(/\s/g, "")).sort().join(",");

const en = flatten(load("en"));
const codes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(DIR).filter((f) => f.endsWith(".ts") && f !== "en.ts").map((f) => f.replace(/\.ts$/, ""));

let failures = 0;
for (const code of codes) {
  const problems = [];
  let loc;
  try {
    loc = flatten(load(code));
  } catch (e) {
    problems.push(`can't load: ${e.message}`);
  }
  if (loc) {
    for (const key of Object.keys(en)) {
      if (!(key in loc)) problems.push(`missing ${key}`);
      else if (!loc[key].trim()) problems.push(`empty ${key}`);
      else if (foreign(code, loc[key]).length) problems.push(`other-script characters in ${key}: ${foreign(code, loc[key]).map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ")} in \"${loc[key]}\"`);
      else if (placeholders(loc[key]) !== placeholders(en[key])) problems.push(`placeholders differ in ${key}: en "${placeholders(en[key])}" vs "${placeholders(loc[key])}"`);
    }
    for (const key of Object.keys(loc)) if (!(key in en)) problems.push(`extra ${key}`);
    const same = Object.keys(en).filter((k) => loc[k] === en[k] && /[a-z]{4,}/i.test(en[k]) && !/^(Fynrox|FynroX|Prime|Basic|GST|OK)$/.test(en[k]));
    console.log(`${code}: ${Object.keys(loc).length} strings, ${same.length} left identical to English${same.length ? ` (e.g. ${same.slice(0, 3).join(", ")})` : ""}`);
  }
  if (problems.length) {
    failures += problems.length;
    console.log(`FAIL ${code}\n  ${problems.slice(0, 30).join("\n  ")}${problems.length > 30 ? `\n  ... and ${problems.length - 30} more` : ""}`);
  } else console.log(`PASS ${code}`);
}
if (failures) {
  console.log(`\n${failures} problem(s).`);
  process.exit(1);
}
console.log(`\nAll ${codes.length} locale(s) match en.ts.`);
