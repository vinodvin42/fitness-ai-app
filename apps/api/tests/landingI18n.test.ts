import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the marketing site's translation layer.
 *
 * The site has no build step and no framework, so it translates with
 * `data-i18n` attributes and assets/js/i18n.js rather than i18next. That
 * choice removes i18next's worst failure (a missing key rendering as
 * itself — English stays in the HTML, so a missing key is invisible) and
 * introduces two of its own:
 *
 *   1. Copy added to a page without a `data-i18n` attribute simply never
 *      translates, and nothing anywhere says so. Every other app catches
 *      this because the string has to come from `t()` to appear at all;
 *      here the English is already in the markup and looks finished.
 *   2. assets/i18n/en.js — the file a translator is handed — is a copy
 *      of the English in the pages. Two copies of the same sentence
 *      drift, and the drift is silent in exactly the same way.
 *
 * So this file asserts both directions: every visible string on every
 * page is keyed, and every key's English is byte-identical to the page.
 *
 * Lives in the API's suite for the same reason i18nCatalogue.test.ts
 * does: it is the only workspace with a test runner.
 */

const LANDING = path.join(__dirname, "../../landing");
const PAGES = fs
  .readdirSync(LANDING)
  .filter((f) => f.endsWith(".html"))
  .sort();

/* ------------------------------------------------------------------ */
/* A minimal HTML reader. The site's markup is hand-written and well
 * formed; this needs to find element boundaries and attributes, not to
 * be a browser. */

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
/** Contents that are not prose: script bodies, CSS, icon paths. */
const OPAQUE = new Set(["script", "style", "svg"]);
/** Brand tokens read the same in every language. */
const BRAND = new Set(["Fynrox", "FX", "FYNROX"]);

interface Node {
  name: string;
  raw: string;
  innerStart: number;
  innerEnd: number;
  children: Node[];
  texts: Array<[number, number]>;
}

function parse(src: string): Node {
  const root: Node = { name: "#root", raw: "", innerStart: 0, innerEnd: src.length, children: [], texts: [] };
  const stack: Node[] = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].texts.push([i, lt]);
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<!", lt)) {
      const end = src.indexOf(">", lt);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    // Scan to the tag's ">", honouring quoted attribute values so that a
    // ">" inside copy (`data-known-body="... > ..."`) cannot end it.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < src.length) {
      const c = src[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j++;
    }
    const end = Math.min(j + 1, src.length);
    const raw = src.slice(lt, end);
    const m = /^<\s*(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
    if (!m) {
      stack[stack.length - 1].texts.push([lt, end]);
      i = end;
      continue;
    }
    const name = m[2].toLowerCase();
    if (m[1]) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack[k].innerEnd = lt;
          stack.length = k;
          break;
        }
      }
    } else {
      const node: Node = { name, raw, innerStart: end, innerEnd: end, children: [], texts: [] };
      stack[stack.length - 1].children.push(node);
      if (!VOID.has(name) && !/\/\s*>$/.test(raw)) stack.push(node);
    }
    i = end;
  }
  while (stack.length > 1) stack.pop()!.innerEnd = src.length;
  return root;
}

function attr(node: Node, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(node.raw);
  return m ? m[1] : null;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'",
};
const decode = (s: string) => s.replace(/&(#?\w+);/g, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const hasLetters = (s: string) => /[A-Za-z]/.test(s);

interface Keyed {
  page: string;
  key: string;
  /** What the page actually says, as the runtime would read it back. */
  english: string;
}

/**
 * Walks one page, returning every key it declares and, separately, every
 * visible run of text that no key covers.
 */
function scan(page: string): { keyed: Keyed[]; uncovered: string[] } {
  const src = fs.readFileSync(path.join(LANDING, page), "utf8");
  const keyed: Keyed[] = [];
  const uncovered: string[] = [];

  function visit(node: Node): void {
    if (node.name !== "#root") {
      if (OPAQUE.has(node.name)) return;

      const spec = attr(node, "data-i18n-attr");
      const keyedAttrs = new Set<string>();
      if (spec) {
        for (const pair of spec.split(";")) {
          const [name, ...rest] = pair.split(":");
          const key = rest.join(":");
          if (!name || !key) continue;
          keyedAttrs.add(name);
          const value = attr(node, name);
          if (value != null) keyed.push({ page, key, english: norm(value) });
        }
      }
      // An attribute carrying copy but no key translates nowhere.
      for (const name of ["aria-label", "alt", "placeholder", "title", "data-success-title", "data-success-body", "data-known-body"]) {
        const value = attr(node, name);
        if (value && hasLetters(decode(value)) && !BRAND.has(value.trim()) && !keyedAttrs.has(name)) {
          uncovered.push(`${name}="${value.slice(0, 60)}"`);
        }
      }

      const textKey = attr(node, "data-i18n");
      const htmlKey = attr(node, "data-i18n-html");
      if (textKey != null || htmlKey != null) {
        const inner = src.slice(node.innerStart, node.innerEnd);
        keyed.push({
          page,
          key: (textKey ?? htmlKey)!,
          // `data-i18n` swaps textContent, so its catalogue value is the
          // decoded text; `data-i18n-html` swaps innerHTML, so its value
          // is the markup as written.
          english: textKey != null ? norm(decode(inner)) : norm(inner),
        });
        return; // the subtree is that string
      }

      const direct = norm(node.texts.map(([s, e]) => src.slice(s, e)).join(" "));
      if (direct && hasLetters(decode(direct)) && !BRAND.has(decode(direct))) {
        uncovered.push(`<${node.name}> ${decode(direct).slice(0, 60)}`);
      }
    }
    for (const child of node.children) visit(child);
  }

  visit(parse(src));
  return { keyed, uncovered };
}

/* ------------------------------------------------------------------ */

/** Loads assets/i18n/en.js the way a browser would. */
function loadCatalogue(): Record<string, string> {
  const src = fs.readFileSync(path.join(LANDING, "assets/i18n/en.js"), "utf8");
  const window: { FYNROX_I18N?: Record<string, Record<string, string>> } = {};
  new Function("window", src)(window);
  return window.FYNROX_I18N!.en;
}

/**
 * The `t("key", "English")` call sites in the site's own scripts — copy
 * that JavaScript builds rather than the HTML. The English argument is
 * evaluated rather than pattern-matched because several are written as
 * concatenations across lines.
 */
function scriptCalls(): Array<{ file: string; key: string; english: string }> {
  const out: Array<{ file: string; key: string; english: string }> = [];
  const dir = path.join(LANDING, "assets/js");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const re = /\bt\(\s*"([\w.]+)"\s*,/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      let i = re.lastIndex;
      let depth = 1;
      let quote: string | null = null;
      let escaped = false;
      for (; i < src.length; i++) {
        const c = src[i];
        if (escaped) { escaped = false; continue; }
        if (quote) {
          if (c === "\\") escaped = true;
          else if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
        if (c === "(") depth++;
        else if (c === ")") { depth--; if (depth === 0) break; }
      }
      const expr = src.slice(re.lastIndex, i).trim().replace(/,\s*$/, "");
      out.push({ file, key: m[1], english: new Function(`"use strict"; return (${expr});`)() as string });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */

describe("landing site translation", () => {
  const CATALOGUE = loadCatalogue();
  const scans = PAGES.map((p) => ({ page: p, ...scan(p) }));
  const keyed = scans.flatMap((s) => s.keyed);
  const calls = scriptCalls();

  it("read the real pages, rather than passing on an empty scan", () => {
    // Every assertion here is a parse of hand-written HTML, and a parser
    // that finds nothing makes all of them pass. The numbers are floors
    // well under the current counts, not targets.
    expect(PAGES.length).toBeGreaterThan(20);
    expect(keyed.length).toBeGreaterThan(1000);
    expect(Object.keys(CATALOGUE).length).toBeGreaterThan(500);
    expect(calls.length).toBeGreaterThan(10);
  });

  it("every visible string on every page is keyed — unkeyed copy silently never translates", () => {
    const problems = scans.flatMap((s) => s.uncovered.map((u) => `${s.page}: ${u}`));
    expect(problems, "text with no data-i18n attribute above it").toEqual([]);
  });

  it("every key a page declares exists in assets/i18n/en.js", () => {
    const missing = keyed.filter((k) => !(k.key in CATALOGUE)).map((k) => `${k.key}  (${k.page})`);
    expect([...new Set(missing)], "keys in the markup with no catalogue entry").toEqual([]);
  });

  it("the catalogue says exactly what the pages say — the two copies must not drift", () => {
    const drifted = keyed
      .filter((k) => k.key in CATALOGUE && CATALOGUE[k.key] !== k.english)
      .map((k) => `${k.key} (${k.page})\n    page:      ${k.english}\n    catalogue: ${CATALOGUE[k.key]}`);
    expect([...new Set(drifted)], "a translator would be shown copy the site no longer uses").toEqual([]);
  });

  it("every t() call in the site's scripts matches the catalogue", () => {
    const wrong = calls
      .filter((c) => CATALOGUE[c.key] !== c.english)
      .map((c) => `${c.key} (${c.file})\n    code:      ${c.english}\n    catalogue: ${CATALOGUE[c.key] ?? "(missing)"}`);
    expect(wrong, "the English fallback in code disagrees with the catalogue").toEqual([]);
  });

  it("has no unreachable keys — copy nobody can see is copy nobody maintains", () => {
    const reached = new Set([...keyed.map((k) => k.key), ...calls.map((c) => c.key)]);
    expect([...Object.keys(CATALOGUE)].filter((k) => !reached.has(k)), "catalogue keys nothing uses").toEqual([]);
  });

  it("loads i18n.js before the scripts that write into the page", () => {
    // main.js rewrites the footer year and download.html writes a
    // referral code into translated markup. Both re-run on the
    // `fynrox:i18n` event, but only if i18n.js was there to dispatch it.
    //
    // Matched against the actual <script src> tags rather than against
    // the raw text of the file. indexOf over the whole source also found
    // the filename inside an HTML comment — index.html has one above the
    // hero explaining that main.js attaches the video source — and
    // reported the page as loading its scripts in the wrong order when
    // the order was fine. A comment mentioning a file is not a load of
    // it.
    const wrong = PAGES.filter((p) => {
      const src = fs.readFileSync(path.join(LANDING, p), "utf8");
      // Matched on the file name rather than the whole path: the site's
      // URLs became root-absolute on 3 Oct 2026 ("/assets/js/i18n.js"),
      // and a check pinned to the old relative spelling reported all 24
      // pages as broken when nothing about their order had changed.
      const srcs = [...src.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/g)].map((m) =>
        m[1].split("/").pop(),
      );
      const i18n = srcs.indexOf("i18n.js");
      const main = srcs.indexOf("main.js");
      return i18n < 0 || main < 0 || i18n > main;
    });
    expect(wrong, "pages missing i18n.js, or loading it after main.js").toEqual([]);
  });

  it("offers only languages that have a catalogue file", () => {
    // A picker listing a language whose file does not exist silently
    // leaves the visitor on English after they chose otherwise.
    const src = fs.readFileSync(path.join(LANDING, "assets/js/i18n.js"), "utf8");
    const list = /var LANGUAGES = \[([^\]]*)\]/.exec(src);
    expect(list, "LANGUAGES not found in assets/js/i18n.js").not.toBeNull();
    const codes = [...list![1].matchAll(/code:\s*"([\w-]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);
    const missing = codes.filter((c) => !fs.existsSync(path.join(LANDING, `assets/i18n/${c}.js`)));
    expect(missing, "languages in the picker with no catalogue file").toEqual([]);
  });
});
