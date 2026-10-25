import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import type { LocaleCatalogue } from "./locales/en";
import { hi } from "./locales/hi";
import { ta } from "./locales/ta";
import { te } from "./locales/te";
import { kn } from "./locales/kn";
import { mr } from "./locales/mr";
import { bn } from "./locales/bn";
import { gu } from "./locales/gu";
import { ml } from "./locales/ml";
import { pa } from "./locales/pa";

/**
 * Translation layer for the user app.
 *
 * The Definition of Done requires copy to be "in English and wired for
 * translation (no strings in code)". The app already persists a
 * `languagePreference` across ten Indian languages and has done since
 * the Language screen shipped — what was missing was anything that read
 * it, so choosing a language changed nothing.
 *
 * Why a library rather than a lookup object: Hindi, Tamil, Telugu,
 * Bengali and the rest do not pluralise the way English does, and
 * `count === 1 ? "x" : "xs"` is wrong in most of them. i18next resolves
 * plurals through CLDR rules per language, which is the part that is
 * genuinely hard to get right and easy to get silently wrong.
 *
 * Only `en` is populated. The other nine resolve through `fallbackLng`,
 * so an untranslated screen shows English rather than a raw key — the
 * alternative, showing `guidance.status.open.label` to a user, is worse
 * than showing them a language they may not have chosen.
 *
 * Migration state: catalogue keys exist for the screens listed in
 * `locales/en.ts`. Screens not yet migrated still carry inline strings
 * and are not broken by this — they simply do not translate yet. New
 * screens should use `useTranslation()` from the start; see
 * `docs/mobile/i18n.md`.
 */
export const SUPPORTED_LANGUAGES = [
  "en",
  "hi",
  "ta",
  "te",
  "kn",
  "mr",
  "bn",
  "gu",
  "ml",
  "pa",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const RESOURCES: Partial<Record<SupportedLanguage, { translation: LocaleCatalogue }>> = {
  en: { translation: en },
  // Owner, 25 Oct 2026: "add indian languages". The nine catalogues are machine-translated from en.ts and
  // need a native speaker's review; screens whose copy isn't in the catalogue yet stay English, so the
  // Language screen marks these Beta (BETA_LANGUAGES). tests/i18n-locales.check.cjs keeps their keys and
  // {{placeholders}} in step with en.ts.
  hi: { translation: hi },
  ta: { translation: ta },
  te: { translation: te },
  kn: { translation: kn },
  mr: { translation: mr },
  bn: { translation: bn },
  gu: { translation: gu },
  ml: { translation: ml },
  pa: { translation: pa },
};

/**
 * Languages whose copy exists. The Language screen offers only these: a language that would render all
 * English is a choice that changes nothing. Derived from the resources above, so a new catalogue appears
 * on that screen the moment it is added there.
 */
export const TRANSLATED_LANGUAGES = SUPPORTED_LANGUAGES.filter((code) => RESOURCES[code] != null);

/** Partly translated (25 Oct 2026): the catalogue covers menus and the screens moved to it; the rest is English. */
export const BETA_LANGUAGES: readonly string[] = TRANSLATED_LANGUAGES.filter((code) => code !== "en");

void i18next.use(initReactI18next).init({
  resources: RESOURCES,
  lng: "en",
  fallbackLng: "en",
  // React Native has no <html lang>, and every string here is plain text
  // rendered into a <Text>, so i18next's XSS escaping would only mangle
  // apostrophes and ampersands in copy.
  interpolation: { escapeValue: false },
  returnNull: false,
  // i18next returns THE KEY ITSELF for a key it cannot find, so a typo
  // renders `auth.login.titel` as visible text and nothing errors. The
  // comment that used to sit here claimed `returnNull` prevented that;
  // it does not — it only controls what a key whose value is literally
  // `null` returns.
  //
  // Two real guards replace that wishful comment:
  //   1. apps/api/tests/i18nCatalogue.test.ts fails the build if any
  //      `t("...")` in this app has no matching key. That is the one
  //      that actually holds the line.
  //   2. This handler, so the same mistake is loud in development
  //      rather than waiting for the test. Silent in production: a
  //      console warning helps nobody there, and throwing over a
  //      missing string would take a screen down over copy.
  // `saveMissing` is what makes i18next CALL `missingKeyHandler` at all —
  // with it false the handler below never runs, which would have made
  // this guard exactly the decorative thing the comment above complains
  // about. `__DEV__` keeps it to development; with no backend configured
  // it only invokes the handler, it does not write anywhere.
  saveMissing: __DEV__,
  missingKeyHandler: (_lngs, ns, key) => {
    console.warn(`[i18n] missing key "${key}" in "${ns}" — it will render as itself`);
  },
});

/**
 * Applies a stored `languagePreference`. Called when the auth context
 * loads a user and when the Language screen saves a change, so the two
 * stay in step without either owning the other.
 */
export function applyLanguagePreference(preference: string | null | undefined) {
  const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(preference ?? "")
    ? (preference as SupportedLanguage)
    : "en";
  if (i18next.language !== lang) void i18next.changeLanguage(lang);
}

export { i18next };
