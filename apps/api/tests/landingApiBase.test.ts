import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards how the marketing site finds the API.
 *
 * The bug this exists to prevent already shipped once. admin-web and
 * both partner portals get an absolute API URL compiled in through
 * Vite's `VITE_API_BASE_URL`; apps/landing deliberately has no build
 * step, so nothing could inject one, and its scripts fell back to a
 * same-origin `/api`. The Static Web App has no route for `/api` and no
 * linked backend, so every form on the public site — Early Access,
 * contact, and the gym, creator and professional applications — and
 * both invite landings were posting into a 404.
 *
 * It survived because it fails honestly: the pages say "We couldn't
 * reach Fynrox" rather than pretending to succeed. A reviewer clicking
 * around sees a site that looks finished.
 *
 * The fix has three parts and all three have to hold together, which is
 * why they are asserted together here: a committed config.js carrying
 * the development default, a script tag for it on every page ahead of
 * the scripts that call the API, and a deploy step that overwrites it
 * with the real origin and refuses to ship if the secret is empty.
 */

const LANDING = path.join(__dirname, "../../landing");
const WORKFLOW = path.join(
  __dirname,
  "../../../.github/workflows/azure-static-web-apps-purple-sea-0edcdc910.yml",
);
const PAGES = fs
  .readdirSync(LANDING)
  .filter((f) => f.endsWith(".html"))
  .sort();

describe("landing API base URL", () => {
  it("read the real pages, rather than passing on an empty scan", () => {
    expect(PAGES.length).toBeGreaterThan(20);
    expect(fs.existsSync(WORKFLOW)).toBe(true);
  });

  it("ships a config.js that sets the global the API callers read", () => {
    const src = fs.readFileSync(path.join(LANDING, "assets/js/config.js"), "utf8");
    expect(src).toMatch(/window\.FYNROX_API_BASE_URL\s*=/);
  });

  it("every page loads config.js before any script that calls the API", () => {
    // forms.js and invite.js read the global at call time, not at load
    // time, so strictly they only need it set before a submit. Asserting
    // load order anyway: it costs nothing and removes a class of bug
    // that would otherwise depend on how fast someone clicks.
    const problems: string[] = [];
    for (const page of PAGES) {
      const src = fs.readFileSync(path.join(LANDING, page), "utf8");
      const config = src.indexOf("assets/js/config.js");
      if (config < 0) {
        problems.push(`${page}: does not load config.js`);
        continue;
      }
      for (const caller of ["assets/js/forms.js", "assets/js/invite.js"]) {
        const at = src.indexOf(caller);
        if (at >= 0 && at < config) problems.push(`${page}: loads ${caller} before config.js`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("the API callers read the global rather than hardcoding an origin", () => {
    for (const file of ["forms.js", "invite.js"]) {
      const src = fs.readFileSync(path.join(LANDING, "assets/js", file), "utf8");
      expect(src, `${file} should read window.FYNROX_API_BASE_URL`).toMatch(
        /window\.FYNROX_API_BASE_URL/,
      );
      // A literal azurewebsites.net URL in the source would mean the
      // environment had been baked into the repo, which is the thing
      // config.js exists to avoid.
      expect(src, `${file} should not hardcode a deployed host`).not.toMatch(/azurewebsites\.net/);
    }
  });

  it("the deploy overwrites config.js and refuses to ship the localhost default", () => {
    // Without this step the committed development default reaches
    // production, and every form on a public marketing site fails while
    // the pages still look finished.
    const yml = fs.readFileSync(WORKFLOW, "utf8");
    expect(yml, "deploy workflow should rewrite the landing config").toContain(
      "combined-web-deploy/assets/js/config.js",
    );
    expect(yml, "deploy workflow should read the API_BASE_URL secret").toMatch(
      /API_BASE_URL:\s*\$\{\{\s*secrets\.API_BASE_URL\s*\}\}/,
    );
    expect(yml, "deploy workflow should fail on an empty API_BASE_URL").toMatch(
      /if \[ -z "\$API_BASE_URL" \]/,
    );
    expect(yml, "deploy workflow should verify what it actually wrote").toMatch(
      /written=\$\(grep -oE 'window\\\.FYNROX_API_BASE_URL/,
    );
  });
});
