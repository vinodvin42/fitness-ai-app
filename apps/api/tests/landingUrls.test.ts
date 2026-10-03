import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every in-site URL on the marketing site must be root-absolute.
 *
 * This shipped broken. Pages referenced their stylesheet as
 * `assets/css/styles.css`, relative to the document — fine at
 * `/index.html`, and wrong everywhere else.
 *
 * staticwebapp.config.json rewrites `/gym/*` to gym-invite.html and
 * `/r/*` to referral.html. Those are the invite and referral links
 * partners and creators actually hand out. At `/gym/HYD-001` a relative
 * stylesheet resolves to `/gym/assets/css/styles.css`, which does not
 * exist — and because the rewrite matches *any* subpath, Azure answered
 * it with gym-invite.html. A browser will not apply `text/html` as a
 * stylesheet, so the page rendered as naked serif HTML. The same held
 * for any deep path: `/programs/exercises` served a page whose CSS
 * resolved to `/programs/assets/...` and came back as `404.html`.
 *
 * Relative page links had the same defect one step further on: clicking
 * "Home" from a nested URL went to `/gym/index.html`, which rewrote
 * back to the invite page rather than going home.
 *
 * It survived local testing because serve.js answered those requests
 * with 200 and an HTML body, so a local check looked correct. serve.js
 * now returns a plain 404 for a missing file, the way Azure does.
 */

const LANDING = path.join(__dirname, "../../landing");
const PAGES = fs
  .readdirSync(LANDING)
  .filter((f) => f.endsWith(".html"))
  .sort();
const SCRIPTS = fs
  .readdirSync(path.join(LANDING, "assets/js"))
  .filter((f) => f.endsWith(".js"))
  .sort();

/** Every href/src/data-src value that points inside this site. */
function inSiteUrls(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\b(?:href|src|data-src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(?:https?:|mailto:|tel:|data:|#)/.test(url)) continue;
    out.push(url);
  }
  return out;
}

describe("landing site URLs are root-absolute", () => {
  it("read the real pages, rather than passing on an empty scan", () => {
    expect(PAGES.length).toBeGreaterThan(20);
    expect(PAGES.flatMap((p) => inSiteUrls(fs.readFileSync(path.join(LANDING, p), "utf8"))).length)
      .toBeGreaterThan(500);
  });

  it("no page references an asset or another page relatively", () => {
    const offenders: string[] = [];
    for (const page of PAGES) {
      const src = fs.readFileSync(path.join(LANDING, page), "utf8");
      for (const url of inSiteUrls(src)) {
        if (!url.startsWith("/")) offenders.push(`${page}: ${url}`);
      }
    }
    expect(offenders, "relative URLs break on /gym/*, /r/* and every deep path").toEqual([]);
  });

  it("every root-absolute target actually exists", () => {
    // A root-absolute URL that points at nothing is a different bug with
    // the same symptom, so the paths are resolved on disk rather than
    // merely pattern-matched.
    //
    // /app/ and /portal/* are the consoles, which only exist once
    // scripts/merge-web-deploy.js mounts them beside this folder, so
    // they cannot be resolved from here.
    const MOUNTED = ["/app/", "/portal/"];
    const missing: string[] = [];
    for (const page of PAGES) {
      const src = fs.readFileSync(path.join(LANDING, page), "utf8");
      for (const url of inSiteUrls(src)) {
        if (!url.startsWith("/")) continue;
        if (MOUNTED.some((m) => url.startsWith(m))) continue;
        const bare = url.split(/[?#]/)[0];
        if (bare === "/") continue;
        if (!fs.existsSync(path.join(LANDING, bare))) missing.push(`${page}: ${url}`);
      }
    }
    expect(missing, "root-absolute URLs with nothing behind them").toEqual([]);
  });

  it("the scripts do not navigate or fetch relatively either", () => {
    // cookie-consent.js links to the privacy policy, invite.js sends the
    // visitor to the download page with their code, and i18n.js fetches
    // a catalogue. All three run on /gym/{code} and /r/{code}.
    const offenders: string[] = [];
    for (const file of SCRIPTS) {
      const src = fs.readFileSync(path.join(LANDING, "assets/js", file), "utf8");
      for (const m of src.matchAll(/"((?:assets\/|[a-z0-9-]+\.html)[^"]*)"/g)) {
        offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders, "a relative URL in a script breaks on the rewritten routes").toEqual([]);
  });

  it("the translation catalogue's links are root-absolute too", () => {
    // The catalogue carries anchors inside translated values. If these
    // drift from the pages the byte-identical check in landingI18n fails,
    // but a relative link that matches a relative link in the page would
    // pass that check and still be broken.
    const src = fs.readFileSync(path.join(LANDING, "assets/i18n/en.js"), "utf8");
    const relative = [...src.matchAll(/href=\\"([^"\\]+)\\"/g)]
      .map((m) => m[1])
      .filter((u) => !/^(?:https?:|mailto:|tel:|#|\/)/.test(u));
    expect(relative, "relative links inside translated copy").toEqual([]);
  });
});
