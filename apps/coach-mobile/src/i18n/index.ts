import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";

/**
 * Translation layer for the professional app, mirroring
 * apps/user-mobile/src/i18n/index.ts. The Definition of Done requires
 * copy to be "in English and wired for translation (no strings in
 * code)", and this app had no mechanism at all.
 *
 * Why a library rather than a lookup object, in one sentence: Hindi,
 * Tamil, Telugu and Bengali do not pluralise the way English does, and
 * `count === 1 ? "client" : "clients"` is correct in English and
 * silently wrong in most of them. i18next resolves plurals through CLDR
 * rules per language.
 *
 * **There is no professional language preference yet.** Unlike a `User`,
 * the `Professional` model carries no `languagePreference` column, so
 * there is nothing for this app to read and no language selector is
 * shown — a picker that saved nowhere would be worse than none.
 * `applyLanguagePreference` exists and is correct; wiring it up is one
 * line in AuthContext the day the API grows that field.
 */
export const SUPPORTED_LANGUAGES = ["en", "hi", "ta", "te", "kn", "mr", "bn", "gu", "ml", "pa"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  // React Native has no <html lang>, and every string here renders into
  // a <Text>, so escaping would only mangle apostrophes and ampersands.
  interpolation: { escapeValue: false },
  returnNull: false,
  // i18next returns THE KEY ITSELF for a key it cannot find, so a typo
  // renders `today.titel` as visible text and nothing errors.
  // `saveMissing` is what makes it CALL the handler below — without it
  // the handler never runs. `__DEV__` keeps it out of production; the
  // real guard is apps/api/tests/i18nCatalogue.test.ts, which fails the
  // build.
  saveMissing: __DEV__,
  missingKeyHandler: (_lngs, ns, key) => {
    console.warn(`[i18n] missing key "${key}" in "${ns}" — it will render as itself`);
  },
});

/**
 * Applies a stored language preference. Nothing calls this yet — see the
 * note above on why the professional has no preference to store.
 */
export function applyLanguagePreference(preference: string | null | undefined) {
  const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(preference ?? "")
    ? (preference as SupportedLanguage)
    : "en";
  if (i18next.language !== lang) void i18next.changeLanguage(lang);
}

export { i18next };
