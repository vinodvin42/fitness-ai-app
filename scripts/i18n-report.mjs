#!/usr/bin/env node
/*
 * How much of each app's copy is translatable, per screen.
 *
 *   node scripts/i18n-report.mjs            # summary
 *   node scripts/i18n-report.mjs --strings  # + the actual strings left
 *
 * The Definition of Done requires copy "in English and wired for
 * translation (no strings in code)". The retrofit is partial and will be
 * for a while, so the useful thing is a number that moves rather than a
 * binary that stays false. This prints one.
 *
 * Heuristic, and deliberately so: it counts JSX text nodes and the
 * string literals passed to the props that render text (`label`,
 * `title`, `subtitle`, `placeholder`, `message`, `actionLabel`,
 * `accessibilityLabel`). It does NOT understand a string assembled from
 * variables, and it will occasionally flag something that is not user
 * facing. Treat the count as a direction of travel, not a score — the
 * assertion that actually holds the line is
 * apps/api/tests/i18nCatalogue.test.ts, which runs in CI.
 */
import fs from 'node:fs';
import path from 'node:path';

const APPS = ['user-mobile', 'coach-mobile', 'gym-portal', 'creator-portal', 'admin-web'].map((name) => ({
  name,
  root: path.join(import.meta.dirname, `../apps/${name}/src`),
}));
const showStrings = process.argv.includes('--strings');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(e.name) && !full.includes(`${path.sep}i18n${path.sep}`)) out.push(full);
  }
  return out;
}

/*
 * Strings that render to a user but are NOT copy, so no translator
 * should be paid to look at them and no key should exist for them:
 *
 *   - A URL or URL placeholder. "https://…" means the same thing in
 *     every language, and a translated one would be wrong.
 *   - A standard finance or metrics acronym (CAC, LTV, ARPU, MRR). These
 *     are used untranslated in Indian finance and product writing; an
 *     expansion would be less recognisable, not more.
 *
 * Listed explicitly rather than pattern-matched, so adding one is a
 * decision someone makes on purpose.
 */
const NOT_COPY = new Set(['https://…', 'https://...', 'CAC', 'LTV', 'ARPU', 'MRR']);

/** Props whose string value is rendered to the user. */
const TEXT_PROPS = /\b(label|title|subtitle|placeholder|message|actionLabel|accessibilityLabel|accessibilityHint)=\{?"([^"]{2,})"\}?/g;
/** A JSX text node: >Some words< with at least one space or a letter run. */
const JSX_TEXT = />\s*([A-Z][^<>{}\n]{3,})\s*</g;

let grandTotal = 0;
for (const app of APPS) {
  const rows = [];
  for (const file of walk(app.root)) {
    const src = fs.readFileSync(file, 'utf8');
    const inline = new Set();
    for (const m of src.matchAll(TEXT_PROPS)) {
      const text = m[2].trim();
      if (!NOT_COPY.has(text)) inline.add(text);
    }
    for (const m of src.matchAll(JSX_TEXT)) {
      const text = m[1].trim();
      // Skip things that are plainly not sentences: a single capitalised
      // identifier with no space is usually a component or a unit.
      if (/\s/.test(text) && !NOT_COPY.has(text)) inline.add(text);
    }
    const translated = (src.match(/\bt\(\s*["`]/g) || []).length;
    rows.push({ file: path.relative(app.root, file), inline: inline.size, translated, strings: [...inline] });
  }

  rows.sort((a, b) => b.inline - a.inline || a.file.localeCompare(b.file));

  const totalInline = rows.reduce((n, r) => n + r.inline, 0);
  grandTotal += totalInline;
  const touched = rows.filter((r) => r.translated > 0);
  const clean = rows.filter((r) => r.inline === 0);

  console.log(`\n${app.name}: ${rows.length} components`);
  console.log(`  ${touched.length} call t() at all`);
  console.log(`  ${clean.length} have no inline user-facing strings left`);
  console.log(`  ${totalInline} inline strings remain`);

  const worst = rows.filter((r) => r.inline > 0).slice(0, 25);
  if (worst.length) {
    console.log('  Worst first:');
    for (const r of worst) {
      console.log(`    ${String(r.inline).padStart(3)} inline, ${String(r.translated).padStart(3)} t()   ${r.file}`);
      if (showStrings) for (const str of r.strings) console.log(`          · ${str}`);
    }
  }
}

console.log(`\n${grandTotal} inline strings across all apps.`);

/*
 * The marketing site is counted separately because it translates
 * differently: it has no build step, so its English lives in the HTML
 * and a `data-i18n` attribute names the key rather than a `t()` call
 * wrapping the string (see apps/landing/assets/js/i18n.js).
 *
 * Only the keyed counts are reported here. Whether anything is LEFT
 * unkeyed is not a heuristic worth guessing at when an exact answer
 * exists: apps/api/tests/landingI18n.test.ts parses every page and
 * fails on the first unkeyed string, and runs in CI.
 */
const LANDING = path.join(import.meta.dirname, '../apps/landing');
const pages = fs.readdirSync(LANDING).filter((f) => f.endsWith('.html')).sort();
if (pages.length) {
  let keyed = 0;
  const rows = [];
  for (const page of pages) {
    const src = fs.readFileSync(path.join(LANDING, page), 'utf8');
    const n =
      (src.match(/\sdata-i18n="/g) || []).length +
      (src.match(/\sdata-i18n-html="/g) || []).length +
      (src.match(/\sdata-i18n-attr="/g) || []).length;
    keyed += n;
    rows.push({ page, n });
  }

  const catalogue = fs.readFileSync(path.join(LANDING, 'assets/i18n/en.js'), 'utf8');
  const keys = (catalogue.match(/^\s{2}"[^"]+":/gm) || []).length;

  console.log(`\nlanding: ${pages.length} pages`);
  console.log(`  ${keyed} keyed elements and attributes`);
  console.log(`  ${keys} keys in assets/i18n/en.js (shared across pages, so fewer than the above)`);
  if (showStrings) {
    for (const r of rows.sort((a, b) => b.n - a.n)) {
      console.log(`    ${String(r.n).padStart(3)} keyed   ${r.page}`);
    }
  }
}
