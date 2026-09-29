import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../../user-mobile/src/i18n/locales/en";

/**
 * Guards the user app's translation catalogue.
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

const MOBILE = path.join(__dirname, "../../user-mobile/src");

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
function translationCalls(): Array<{ key: string; file: string }> {
  const calls: Array<{ key: string; file: string }> = [];
  for (const file of sourceFiles(MOBILE)) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) {
      calls.push({ key: m[1], file: path.relative(MOBILE, file) });
    }
  }
  return calls;
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
function templatePatterns(): RegExp[] {
  const patterns: RegExp[] = [];
  for (const file of sourceFiles(MOBILE)) {
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

const CATALOGUE = flatten(en);

/**
 * i18next resolves `t("thing", { count })` against `thing_one` /
 * `thing_other`, so the bare `thing` is a legitimate call for a key that
 * does not literally exist. Accepted only when a plural form does.
 */
function resolves(key: string): boolean {
  if (CATALOGUE.has(key)) return true;
  return ["_one", "_other", "_zero", "_two", "_few", "_many"].some((s) => CATALOGUE.has(key + s));
}

describe("user app translation catalogue", () => {
  const calls = translationCalls();

  it("found real t() calls and templates, rather than passing on an empty scan", () => {
    expect(templatePatterns().length).toBeGreaterThan(0);
    // The scanner is a regex over source text and can fail by matching
    // nothing, which would make the assertion below vacuous.
    expect(calls.length).toBeGreaterThan(5);
    expect(CATALOGUE.size).toBeGreaterThan(30);
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
    const patterns = templatePatterns();
    const unreachable = [...CATALOGUE].filter((k) => {
      if (asked.has(k)) return false;
      // A plural key is reached by its base name.
      const base = k.replace(/_(one|other|zero|two|few|many)$/, "");
      if (asked.has(base)) return false;
      return !patterns.some((p) => p.test(k) || p.test(base));
    });
    expect(unreachable, "catalogue keys no t() call reaches").toEqual([]);
  });
});
