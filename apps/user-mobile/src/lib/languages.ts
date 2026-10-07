/**
 * Languages offered in Settings > Language (Figma Profile & Settings 07).
 * Codes are ISO 639-1, matching `User.languagePreference`. The app copy is
 * English-only for now; the choice is saved for when translations ship.
 */
export interface AppLanguage {
  code: string;
  /** Name in the language itself, shown as the card title. */
  native: string;
  /** English name, shown under it and used for search. */
  english: string;
}

export const LANGUAGES: AppLanguage[] = [
  { code: "en", native: "English", english: "English" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "mr", native: "मराठी", english: "Marathi" },
  { code: "bn", native: "বাংলা", english: "Bengali" },
  { code: "gu", native: "ગુજરાતી", english: "Gujarati" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi" },
];

export function languageLabel(code: string | undefined): string {
  return LANGUAGES.find((l) => l.code === code)?.english ?? "English";
}
