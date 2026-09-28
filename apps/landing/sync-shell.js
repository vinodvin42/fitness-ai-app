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

function navBlock(current) {
  const lines = [
    '      <button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="primaryNav" hidden>',
    '        <span class="nav-toggle__bars" aria-hidden="true"><span></span><span></span><span></span></span>',
    "        <span>Menu</span>",
    "      </button>",
    '      <nav class="nav" id="primaryNav" aria-label="Primary">',
    `        <a class="nav__link" href="index.html"${current === "index.html" ? ' aria-current="page"' : ""}>Home</a>`,
  ];
  for (const [href, label] of NAV_LINKS) {
    lines.push(`        <a class="nav__link" href="${href}"${href === current ? ' aria-current="page"' : ""}>${label}</a>`);
  }
  lines.push('        <a class="btn btn--primary btn--sm" href="early-access.html">Get early access</a>');
  lines.push("      </nav>");
  return lines.join("\n");
}

function footerBlock() {
  const lines = ['      <nav class="footer__nav" aria-label="Footer">'];
  for (const [title, links] of FOOTER_COLS) {
    lines.push("        <div>");
    lines.push(`          <p class="footer__col-title">${title}</p>`);
    for (const [href, label] of links) {
      lines.push(`          <a class="footer__col-link" href="${href}">${label}</a>`);
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

const changed = [];
for (const name of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort()) {
  const file = path.join(ROOT, name);
  const src = fs.readFileSync(file, "utf8");
  let out = src;
  if (NAV_RE.test(out)) out = out.replace(NAV_RE, () => navBlock(name));
  if (FOOTER_RE.test(out)) out = out.replace(FOOTER_RE, () => footerBlock());
  if (out !== src) {
    fs.writeFileSync(file, out);
    changed.push(name);
  }
}

console.log(changed.length ? `sync-shell: rewrote ${changed.join(", ")}` : "sync-shell: nothing to change");
