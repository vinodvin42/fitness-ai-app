import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";

/**
 * Same translation layer as apps/coach-mobile/src/i18n/index.ts: i18next so
 * plurals follow each language's CLDR rules. Only `en` exists; other
 * languages fall back to it. There is no professional language preference in
 * the API yet, so nothing switches the language.
 */
void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  // React escapes text itself.
  interpolation: { escapeValue: false },
  returnNull: false,
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (_lngs, ns, key) => {
    console.warn(`[i18n] missing key "${key}" in "${ns}"; it will render as itself`);
  },
});

export { i18next };
