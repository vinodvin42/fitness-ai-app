#!/usr/bin/env node
/*
 * Regenerates the header nav and footer nav in every page of this site.
 *
 * This site deliberately has no build step and no templating (see
 * README.md), so the header and footer are copy-pasted into each page.
 * That was survivable with 10 pages and one flat nav. With 19 pages, a
 * mobile toggle and a five-column footer it is a guarantee that one page
 * ends up with a stale nav — and a stale nav on a marketing site is a
 * page nobody can reach.
 *
 * This is the compromise: the pages stay plain static HTML that a
 * browser can open from disk, and the two duplicated blocks are
 * regenerated from the lists below whenever the navigation changes.
 * Nothing at deploy time depends on it; run it by hand after editing the
 * lists (`npm run sync-shell --workspace=apps/landing`) and commit the
 * result.
 *
 * Zero dependencies, same as serve.js — only node:fs and node:path.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;

/** The primary nav. Home is prepended and the CTA appended. */
const NAV_LINKS = [
  ["how-it-works.html", "How it works"],
  ["programs.html", "Programs"],
  ["professional-guidance.html", "Guidance"],
  ["pricing.html", "Pricing"],
  ["gyms.html", "For Gyms"],
  ["creators.html", "For Creators"],
  ["professionals.html", "For Professionals"],
  ["learn.html", "Learn"],
];

const FOOTER_COLS = [
  ["Product", [
    ["features.html", "Features"],
    ["how-it-works.html", "How it works"],
    ["programs.html", "Programs"],
    ["pricing.html", "Pricing"],
    ["download.html", "Download"],
  ]],
  ["Partners", [
    ["gyms.html", "For Gyms"],
    ["creators.html", "For Creators"],
    ["professionals.html", "For Professionals"],
    ["professional-guidance.html", "Professional Guidance"],
  ]],
  ["Company", [
    ["about.html", "About"],
    ["learn.html", "Learn"],
    ["faq.html", "FAQ"],
    ["support.html", "Support"],
    ["early-access.html", "Early access"],
  ]],
  ["Legal & safety", [
    ["safety.html", "Safety &amp; Privacy"],
    ["privacy.html", "Privacy Policy"],
    ["terms.html", "Terms of Service"],
  ]],
  ["Sign in", [
    ["/app/", "Admin"],
    ["https://calm-ground-04d678410.3.azurestaticapps.net/", "Coach"],
  ]],
];

/*
 * Translation keys are generated here rather than written out, because
 * the nav and footer are generated here: a hand-written key list would
 * be one more thing to forget when a link is added, and a link whose
 * key is missing renders the key as its label (i18next's behaviour, and
 * ours — see assets/js/i18n.js).
 *
 * The shell is byte-identical on all 24 pages, so its strings share one
 * set of `shell.*` keys instead of 24 copies of "Home". That is not
 * only smaller: 24 copies drift, and a nav that says one thing on the
 * home page and another everywhere else is the bug this avoids.
 */
function keyOf(label) {
  const words = label
    .replace(/&[a-z]+;/g, " ")
    .replace(/['\u2019]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  return words.map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join("");
}

function navBlock(current) {
  const lines = [
    '      <button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="primaryNav" hidden>',
    '        <span class="nav-toggle__bars" aria-hidden="true"><span></span><span></span><span></span></span>',
    '        <span data-i18n="shell.nav.menu">Menu</span>',
    "      </button>",
    '      <nav class="nav" id="primaryNav" aria-label="Primary" data-i18n-attr="aria-label:shell.nav.ariaPrimary">',
    `        <a class="nav__link" href="index.html"${current === "index.html" ? ' aria-current="page"' : ""} data-i18n="shell.nav.home">Home</a>`,
  ];
  for (const [href, label] of NAV_LINKS) {
    lines.push(
      `        <a class="nav__link" href="${href}"${href === current ? ' aria-current="page"' : ""} data-i18n="shell.nav.${keyOf(label)}">${label}</a>`,
    );
  }
  lines.push(
    '        <a class="btn btn--primary btn--sm" href="early-access.html" data-i18n="shell.nav.cta">Get early access</a>',
  );
  lines.push("      </nav>");
  return lines.join("\n");
}

/*
 * The bottom bar: the copyright line and the language picker's host.
 * The picker itself is rendered by assets/js/i18n.js and only when
 * there is more than one language to pick, so this is an empty,
 * hidden element until then rather than a dead control in the footer.
 */
function bottomBlock() {
  return [
    '    <div class="wrap footer__bottom">',
    '      <p data-i18n-html="shell.copyright" class="footer__copy">\u00a9 <span id="year">2026</span> Fynrox. Not a substitute for professional medical advice.</p>',
    '      <div class="footer__lang-wrap" data-i18n-picker hidden></div>',
    "    </div>",
    "  </footer>",
  ].join("\n");
}

function footerBlock() {
  const lines = [
    '      <nav class="footer__nav" aria-label="Footer" data-i18n-attr="aria-label:shell.footer.ariaLabel">',
  ];
  for (const [title, links] of FOOTER_COLS) {
    lines.push("        <div>");
    lines.push(`          <p class="footer__col-title" data-i18n="shell.footer.col.${keyOf(title)}">${title}</p>`);
    for (const [href, label] of links) {
      lines.push(
        `          <a class="footer__col-link" href="${href}" data-i18n="shell.footer.link.${keyOf(label)}">${label}</a>`,
      );
    }
    lines.push("        </div>");
  }
  lines.push("      </nav>");
  return lines.join("\n");
}

// The toggle is optional in the match so this is idempotent: it replaces
// both the original nav-only markup and its own previous output.
const NAV_RE = /(?:[ \t]*<button class="nav-toggle"[\s\S]*?<\/button>\n)?[ \t]*<nav class="nav"[^>]*>[\s\S]*?<\/nav>/;
const FOOTER_RE = /[ \t]*<nav class="footer__nav"[^>]*>[\s\S]*?<\/nav>/;
// Matches both the original bottom bar and this script's own output, so
// re-running is a no-op rather than a second copy.
// Anchored on </footer> because the block it generates now contains a
// <div> of its own: a match that stopped at the first </div> would leave
// the outer one orphaned and grow the file by one line per run.
const BOTTOM_RE = /[ \t]*<div class="wrap(?: footer__bottom)?">\s*<p[^>]*class="footer__copy"[\s\S]*?<\/div>\s*<\/footer>/;

const changed = [];
for (const name of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort()) {
  const file = path.join(ROOT, name);
  const src = fs.readFileSync(file, "utf8");
  let out = src;
  if (NAV_RE.test(out)) out = out.replace(NAV_RE, () => navBlock(name));
  if (FOOTER_RE.test(out)) out = out.replace(FOOTER_RE, () => footerBlock());
  if (BOTTOM_RE.test(out)) out = out.replace(BOTTOM_RE, () => bottomBlock());
  if (out !== src) {
    fs.writeFileSync(file, out);
    changed.push(name);
  }
}

console.log(changed.length ? `sync-shell: rewrote ${changed.join(", ")}` : "sync-shell: nothing to change");
