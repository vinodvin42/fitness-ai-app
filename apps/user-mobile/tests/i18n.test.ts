import { describe, expect, it, beforeAll } from "vitest";
import i18next from "i18next";
import { en } from "../src/i18n/locales/en";
import { SUPPORTED_LANGUAGES, applyLanguagePreference } from "../src/i18n";

/**
 * NOT CURRENTLY RUNNABLE IN THIS REPO — see docs/mobile/i18n.md.
 *
 * `apps/user-mobile` has no test runner: installing vitest into this
 * workspace fails with npm's arborist bug "Cannot read properties of
 * null (reading 'edgesOut')" while resolving vitest 4's optional peers,
 * whether declared in this workspace, pinned, or hoisted to the root.
 * apps/api's copy is not hoisted, so it cannot be borrowed.
 *
 * These assertions were all verified by running the same checks through
 * `tsx` directly, and every one passes. The file is kept as valid vitest
 * so it starts running the moment a runner can be installed — but it is
 * NOT running in CI today, and nobody should read a green build as
 * covering it.
 *
 * The first tests in this app. They exist because the i18n layer is the
 * one piece of client code where being wrong is silent: a missing key
 * renders as `guidance.status.open.label` to a user, and a hand-rolled
 * plural renders as nonsense in Hindi without anything failing.
 *
 * `../src/i18n` is imported for its side effect — it initialises the
 * shared i18next instance, which is exactly what is under test.
 */
describe("i18n", () => {
  beforeAll(() => {
    // The module initialises on import; make the ordering explicit.
    expect(i18next.isInitialized).toBe(true);
  });

  it("offers the ten languages the Language screen lists", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(10);
    expect(SUPPORTED_LANGUAGES).toContain("hi");
    expect(SUPPORTED_LANGUAGES).toContain("ta");
  });

  it("resolves a plain key", () => {
    expect(i18next.t("common.retry")).toBe("Try again");
  });

  it("interpolates", () => {
    expect(i18next.t("checkout.pay", { amount: "₹999.00" })).toBe("Pay ₹999.00");
    expect(i18next.t("purchases.refund.partial", { amount: "₹250.00" })).toBe("Partial refund of ₹250.00");
  });

  it("pluralises through CLDR rules rather than a ternary", () => {
    // The whole reason this is a library. English is the easy case...
    expect(i18next.t("guidance.rematch", { count: 1 })).toContain("1 professional couldn't");
    expect(i18next.t("guidance.rematch", { count: 3 })).toContain("3 professionals couldn't");
  });

  it("never renders a raw key to a user for a language we haven't translated", () => {
    applyLanguagePreference("hi");
    // Hindi has no catalogue yet, so this must fall back to English —
    // showing "guidance.status.open.label" to a user is worse than
    // showing them a language they did not choose.
    const value = i18next.t("guidance.status.open.label");
    expect(value).toBe("Finding a professional");
    expect(value).not.toContain(".");
    applyLanguagePreference("en");
  });

  it("ignores a language it does not support rather than breaking", () => {
    applyLanguagePreference("klingon");
    expect(i18next.language).toBe("en");
    applyLanguagePreference(null);
    expect(i18next.language).toBe("en");
  });

  it("has a detail and a label for every guidance status the API can return", () => {
    // A status the API can emit with no copy behind it is a raw key on
    // screen, which is the failure this whole layer exists to avoid.
    for (const status of ["open", "offered", "fulfilled", "cancelled", "exhausted"] as const) {
      expect(en.guidance.status[status].label.length).toBeGreaterThan(0);
      expect(en.guidance.status[status].detail.length).toBeGreaterThan(0);
    }
  });

  it("has no empty strings anywhere in the catalogue", () => {
    const empties: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        if (node.trim() === "") empties.push(path);
        return;
      }
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(en, "");
    expect(empties).toEqual([]);
  });
});
