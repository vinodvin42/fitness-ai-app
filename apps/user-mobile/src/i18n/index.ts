import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";

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

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  // React Native has no <html lang>, and every string here is plain text
  // rendered into a <Text>, so i18next's XSS escaping would only mangle
  // apostrophes and ampersands in copy.
  interpolation: { escapeValue: false },
  // A missing key in development should be loud; in production it falls
  // back to English rather than showing the key to a user.
  returnNull: false,
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
