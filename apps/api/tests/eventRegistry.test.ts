import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { EVENT_NAME_MAP, SPEC_EVENT_NAMES } from "../src/lib/eventRegistry";

/**
 * Spec §11 names 60 events. This asserts the registry actually covers
 * all of them, and — more usefully — that every emitted name the
 * registry promises is genuinely emitted somewhere in `src`.
 *
 * Without this, the registry would be a wish list: it would keep
 * claiming `access.revoked` exists long after someone deleted the call
 * site. Grepping the source is crude but it is the only check that
 * actually fails when the emitter goes away, which is the failure this
 * guards against.
 */
describe("Spec §11 event coverage", () => {
  it("maps every one of the spec's 60 named events", () => {
    expect(SPEC_EVENT_NAMES).toHaveLength(60);
    for (const name of SPEC_EVENT_NAMES) {
      expect(EVENT_NAME_MAP).toHaveProperty(name);
    }
  });

  it("uses domain.object.action naming throughout", () => {
    for (const name of SPEC_EVENT_NAMES) {
      expect(name).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
    }
  });

  it("emits every name the registry claims", () => {
    // Excludes the registry itself: it names every event, so including
    // it would make this assertion vacuously true — which it silently
    // was on the first draft, for exactly two events.
    const source = execSync(
      "grep -rho --exclude=eventRegistry.ts '\"[a-z_]\\+\\.[a-z_.]\\+\"' src | sort -u",
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const emitted = new Set(
      source
        .split("\n")
        .map((l) => l.trim().replace(/^"|"$/g, ""))
        .filter(Boolean),
    );

    const missing = SPEC_EVENT_NAMES.map((spec) => EVENT_NAME_MAP[spec])
      .filter((n): n is string => n !== null)
      .filter((n) => !emitted.has(n));

    expect(missing).toEqual([]);
  });
});
