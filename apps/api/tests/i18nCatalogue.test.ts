import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { en as userEn } from "../../user-mobile/src/i18n/locales/en";
import { en as coachEn } from "../../coach-mobile/src/i18n/locales/en";
import { en as gymEn } from "../../gym-portal/src/i18n/locales/en";
import { en as creatorEn } from "../../creator-portal/src/i18n/locales/en";
import { en as adminEn } from "../../admin-web/src/i18n/locales/en";

/**
 * Guards every translation catalogue in the repo.
 *
 * i18next returns THE KEY ITSELF when a key is missing. So a typo in
 * `t("today.progressCrad.title")` does not throw, does not fail
 * typecheck, and does not fail any existing test — it renders the literal
 * text `today.progressCrad.title` on a user's screen. There is nothing
 * in this repo that would have caught that before this file.
 *
 * Lives in the API's suite because that is the only workspace with a test
 * runner (docs/mobile/i18n.md records the npm bug that blocks installing
 * one in user-mobile). Importing another workspace's source from here is
 * not tidy; an unguarded catalogue is worse.
 */

const APPS = [
  { name: "user-mobile", src: path.join(__dirname, "../../user-mobile/src"), catalogue: userEn },
  { name: "coach-mobile", src: path.join(__dirname, "../../coach-mobile/src"), catalogue: coachEn },
  { name: "gym-portal", src: path.join(__dirname, "../../gym-portal/src"), catalogue: gymEn },
  { name: "creator-portal", src: path.join(__dirname, "../../creator-portal/src"), catalogue: creatorEn },
  { name: "admin-web", src: path.join(__dirname, "../../admin-web/src"), catalogue: adminEn },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    // The catalogue itself is excluded: it contains every key by
    // definition, and including it is how a coverage check passes
    // vacuously (the event-registry test learned this the hard way).
    else if (/\.tsx?$/.test(entry.name) && !full.includes(`${path.sep}i18n${path.sep}`)) out.push(full);
  }
  return out;
}

/** Every `t("some.key")` call in the app, with the file it came from. */
function translationCalls(root: string): Array<{ key: string; file: string }> {
  const calls: Array<{ key: string; file: string }> = [];
  for (const file of sourceFiles(root)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) {
      calls.push({ key: m[1], file: path.relative(root, file) });
    }
  }
  return calls;
}

/**
 * Catalogue keys named as bare string literals anywhere in the app, which
 * is what an indirection through a helper looks like:
 *
 *   const HOW_IT_WORKS = ["referral.step1", "referral.step2"];
 *   ...
 *   <Text>{t(step)}</Text>
 *
 * The scanner only sees `t(step)` and has no idea what `step` holds.
 * Several module-level arrays and helpers are written this way ON PURPOSE
 * — a translated string in a module-level array freezes the language at
 * import time — so treating them as dead would punish the correct
 * pattern. Wider than matching inside `t(...)`, and deliberately so: the
 * cost of a false negative here (one stale literal keeps a dead key
 * alive) is far smaller than a false positive (the report tells someone
 * to delete live copy).
 */
function literalKeyMentions(root: string): Set<string> {
  const mentioned = new Set<string>();
  for (const file of sourceFiles(root)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/"([a-z][\w]*(?:\.[\w]+)+)"/g)) mentioned.add(m[1]);
  }
  return mentioned;
}

/**
 * Keys built at runtime, e.g. ``t(`guidance.status.${request.status}.label`)``.
 *
 * The first draft of this file ignored these and duly reported ten live
 * `guidance.status.*` keys as unreachable — a report that, followed,
 * would have deleted copy the app renders on every guidance request. A
 * dead-code check that confidently points at live code is worse than no
 * check, so each template becomes a pattern and any catalogue key it
 * could produce counts as reached.
 */
function templatePatterns(root: string): RegExp[] {
  const patterns: RegExp[] = [];
  for (const file of sourceFiles(root)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\(\s*`([^`]+)`/g)) {
      const literal = m[1];
      if (!literal.includes("${")) continue;
      // `${...}` stands for one path segment, so it matches anything but
      // a dot. Deliberately not `.*`: that would make one template
      // vouch for the entire catalogue.
      const source = literal
        .split(/\$\{[^}]*\}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^.]+");
      patterns.push(new RegExp(`^${source}$`));
    }
  }
  return patterns;
}

function flatten(obj: unknown, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") for (const nested of flatten(v, full)) keys.add(nested);
    else keys.add(full);
  }
  return keys;
}

describe.each(APPS)("$name translation catalogue", ({ src, catalogue }) => {
  const CATALOGUE = flatten(catalogue);
  const calls = translationCalls(src);
  const mentioned = literalKeyMentions(src);
  const patterns = templatePatterns(src);

  /**
   * i18next resolves `t("thing", { count })` against `thing_one` /
   * `thing_other`, so the bare `thing` is a legitimate call for a key
   * that does not literally exist. Accepted only when a plural form does.
   */
  function resolves(key: string): boolean {
    if (CATALOGUE.has(key)) return true;
    return ["_one", "_other", "_zero", "_two", "_few", "_many"].some((suffix) => CATALOGUE.has(key + suffix));
  }

  it("found real t() calls, templates and key literals, rather than passing on an empty scan", () => {
    // Every assertion below is a regex over source text, and a regex can
    // fail by matching nothing. Without this they would all pass
    // vacuously — the same failure mode the event-registry test had on
    // its first draft.
    expect(calls.length).toBeGreaterThan(5);
    expect(CATALOGUE.size).toBeGreaterThan(30);
    expect(mentioned.size).toBeGreaterThan(0);
  });

  it("every key the app asks for exists — a missing one renders as itself on screen", () => {
    const missing = calls.filter((c) => !resolves(c.key));
    expect(
      missing.map((m) => `${m.key}  (${m.file})`),
      "these t() calls would render their own key as visible text",
    ).toEqual([]);
  });

  it("has no unreachable keys — copy nobody can see is copy nobody maintains", () => {
    // Not a correctness bug, but a translator is paid per string and a
    // dead key wastes that in nine languages at once.
    const asked = new Set(calls.map((c) => c.key));
    const unreachable = [...CATALOGUE].filter((k) => {
      if (asked.has(k)) return false;
      // A plural key is reached by its base name.
      const base = k.replace(/_(one|other|zero|two|few|many)$/, "");
      if (asked.has(base)) return false;
      if (mentioned.has(k) || mentioned.has(base)) return false;
      return !patterns.some((p) => p.test(k) || p.test(base));
    });
    expect(unreachable, "catalogue keys no t() call reaches").toEqual([]);
  });
});
