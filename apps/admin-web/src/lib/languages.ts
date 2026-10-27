/**
 * Names for the languages a coach can say they speak (Professional.languages,
 * ISO 639-1 codes). The same ten codes as apps/api/src/lib/coachLanguages.ts's
 * SPOKEN_LANGUAGE_CODES; an unknown code is shown as-is.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  mr: "Marathi",
  bn: "Bengali",
  gu: "Gujarati",
  ml: "Malayalam",
  pa: "Punjabi",
};

/** "English, Hindi" — or "" when none are stated. */
export function languageNames(codes: string[] | undefined | null): string {
  return (codes ?? []).map((c) => LANGUAGE_NAMES[c] ?? c).join(", ");
}

/** "4.5 ★ (12)" — or "" when unrated. */
export function ratingLabel(rating: { average: number | null; count: number } | undefined | null): string {
  if (!rating || rating.count === 0 || rating.average == null) return "";
  return `${rating.average.toFixed(1)} ★ (${rating.count})`;
}
