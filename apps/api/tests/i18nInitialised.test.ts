import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Asserts every app actually LOADS its translation catalogue.
 *
 * i18nCatalogue.test.ts checks that every key a `t()` call asks for
 * exists. That is necessary and it is not sufficient, and the gap
 * between the two shipped to production: `apps/admin-web/src/main.tsx`
 * never imported `./i18n`, so i18next was never initialised, every
 * `t()` returned the key it was given, and the live admin console's
 * login screen read "login.email", "login.password" and
 * "LOGIN.SUPERADMINCONSOLE" to anyone who opened it. Sixty-five
 * migrated components, ~1,150 correct catalogue keys, and a green test
 * suite — none of which mattered, because nothing ran `i18next.init()`.
 *
 * The catalogue module initialises as a side effect of being imported,
 * so the whole requirement is one `import "./i18n";` in each app's
 * entry point, ahead of anything that renders. That is easy to leave
 * out and invisible in review, which is what this file is for.
 *
 * Deliberately a text check on the entry file rather than anything
 * cleverer: these are five known files, and a scanner that tried to
 * follow the import graph would be more code than the thing it checks.
 */

const APPS = [
  { name: "admin-web", entry: "apps/admin-web/src/main.tsx", module: "./i18n" },
  { name: "gym-portal", entry: "apps/gym-portal/src/main.tsx", module: "./i18n" },
  { name: "creator-portal", entry: "apps/creator-portal/src/main.tsx", module: "./i18n" },
  { name: "user-mobile", entry: "apps/user-mobile/App.tsx", module: "./src/i18n" },
  { name: "coach-mobile", entry: "apps/coach-mobile/App.tsx", module: "./src/i18n" },
];

const REPO = path.join(__dirname, "../../..");

describe.each(APPS)("$name initialises i18next", ({ name, entry, module }) => {
  const full = path.join(REPO, entry);

  it("has the entry file this test claims to check", () => {
    // Without this, renaming an entry file turns the assertion below
    // into a test of a string that no longer exists anywhere.
    expect(fs.existsSync(full), `${entry} not found — did the entry point move?`).toBe(true);
  });

  it(`imports ${module} for its side effect, so t() returns copy and not key names`, () => {
    const src = fs.readFileSync(full, "utf8");
    // A bare side-effect import, which is how all five are written.
    const sideEffect = new RegExp(`import\\s+["']${module.replace(".", "\\.")}["']`);
    // A named import of the same module also runs it, so it counts.
    const named = new RegExp(`from\\s+["']${module.replace(".", "\\.")}["']`);
    expect(
      sideEffect.test(src) || named.test(src),
      `${entry} never imports ${module}, so i18next is never initialised and every ` +
        `t("some.key") in ${name} renders the literal text "some.key" to a user.`,
    ).toBe(true);
  });
});
