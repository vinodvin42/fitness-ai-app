import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";

/**
 * Translation layer for the gym partner portal, mirroring the two mobile apps
 * (see docs/mobile/i18n.md for the reasoning behind the library).
 *
 * Why a library rather than a lookup object: Hindi, Tamil, Telugu and
 * Bengali do not pluralise the way English does, and
 * `count === 1 ? "member" : "members"` is correct in English and silently
 * wrong in most of them. i18next resolves plurals through CLDR rules.
 *
 * **There is no gym language preference yet.** The `Gym` model
 * carries no `languagePreference` column, so there is nothing to read and
 * no language selector is shown — a picker that saved nowhere would be
 * worse than none. `applyLanguagePreference` is correct and unused;
 * wiring it is one line the day the API grows that field.
 */
export const SUPPORTED_LANGUAGES = ["en", "hi", "ta", "te", "kn", "mr", "bn", "gu", "ml", "pa"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  // React escapes its own output; i18next's escaping on top of that only
  // mangles apostrophes and ampersands in copy.
  interpolation: { escapeValue: false },
  returnNull: false,
  // i18next returns THE KEY ITSELF for a key it cannot find, so a typo
  // renders `nav.dashbaord` as visible text and nothing errors.
  // `saveMissing` is what makes it CALL the handler below — without it
  // the handler never runs. The real guard is
  // apps/api/tests/i18nCatalogue.test.ts, which fails the build.
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (_lngs, ns, key) => {
    console.warn(`[i18n] missing key "${key}" in "${ns}" — it will render as itself`);
  },
});

/** Applies a stored language preference. Nothing calls this yet — see above. */
export function applyLanguagePreference(preference: string | null | undefined) {
  const lang = (SUPPORTED_LANGUAGES as readonly string[]).includes(preference ?? "")
    ? (preference as SupportedLanguage)
    : "en";
  if (i18next.language !== lang) void i18next.changeLanguage(lang);
}

export { i18next };
