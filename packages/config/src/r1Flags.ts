/**
 * R1 build-to defaults, as configuration.
 *
 * "Fynrox R1 — Final Design QA & Build Handoff" §12 ("Open product
 * decisions") lists 14 decisions that are still open and instructs:
 *
 * > Each has a default developers can build to now; code it behind
 * > config so the final answer is a setting change.
 *
 * This file is that config. Every flag's default is the handoff's own
 * stated default, so an unconfigured deployment behaves exactly as the
 * spec prescribes. Overriding one is an env-var change and a restart —
 * never a code change.
 *
 * It also carries the three §2 *locked* decisions that this repository
 * currently contradicts (see docs/platform/fynrox-r1-gap-review.md §A).
 * Those are locked, not open, so their defaults are the spec's answer;
 * the flag exists so the pre-existing implementation can be switched
 * back on for a demo or a staged migration rather than deleted outright
 * while the product team confirms.
 */

/**
 * Reads a boolean override without assuming a bundler.
 *
 * `process.env` is real in Node (apps/api) and statically replaced by
 * Metro (Expo) and Vite, but a bare `process` reference throws at module
 * scope in some web targets — hence the guard rather than a direct read.
 * An unset or unrecognised value always falls back to the spec default,
 * so a typo in an env var can never silently ship non-spec behaviour.
 */
function envFlag(name: string, specDefault: boolean): boolean {
  let raw: string | undefined;
  try {
    raw = typeof process !== "undefined" ? process.env?.[name] : undefined;
  } catch {
    raw = undefined;
  }
  if (raw == null || raw === "") return specDefault;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return specDefault;
}

function envInt(name: string, specDefault: number): number {
  let raw: string | undefined;
  try {
    raw = typeof process !== "undefined" ? process.env?.[name] : undefined;
  } catch {
    raw = undefined;
  }
  if (raw == null || raw === "") return specDefault;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : specDefault;
}

export const r1Flags = {
  /**
   * §2 decision #4 (LOCKED) — "Controlled assignment via 'Request
   * professional guidance'. No browsing, ratings or per-session prices."
   * The Overview's "Out of scope for R1" list names the open marketplace
   * explicitly.
   *
   * `false` hides coach discovery, coach profiles, per-session booking
   * and the professional-app Calendar tab, leaving the admin-assigned
   * offer flow (D1's default) as the only route into a relationship.
   * The underlying code and its tests are retained, not deleted, so
   * flipping this back on restores the previous behaviour intact.
   */
  PROFESSIONAL_MARKETPLACE_ENABLED: envFlag("FYNROX_PROFESSIONAL_MARKETPLACE_ENABLED", false),

  /**
   * §2 decision #13 (LOCKED) — "No streaks, badges or 'Century Club'".
   * The Overview states it twice: "Gamification: None in R1 (no streaks,
   * badges, achievements)".
   */
  GAMIFICATION_ENABLED: envFlag("FYNROX_GAMIFICATION_ENABLED", false),

  /**
   * Overview "Locked decisions" — the paid tier is Fynrox Premium,
   * singular. `true` collapses the basic/pro/elite ladder to one tier
   * for entitlement and display purposes.
   */
  SINGLE_PREMIUM_TIER: envFlag("FYNROX_SINGLE_PREMIUM_TIER", true),

  /** D1 — "Admin assigns in R1 (controlled network)", vs. auto-match. */
  OFFER_MATCHING_MODE: (function (): "admin_assigns" | "auto_match" {
    let raw: string | undefined;
    try {
      raw = typeof process !== "undefined" ? process.env?.FYNROX_OFFER_MATCHING_MODE : undefined;
    } catch {
      raw = undefined;
    }
    return raw === "auto_match" ? "auto_match" : "admin_assigns";
  })(),

  /**
   * D2 — "Included in Premium; Admin price field kept for later."
   * `false` means a programme is not separately purchasable; Premium
   * entitlement alone unlocks Fat Loss, Muscle Gain and Strength.
   */
  PROGRAMS_SOLD_SEPARATELY: envFlag("FYNROX_PROGRAMS_SOLD_SEPARATELY", false),

  /** D3 — "Prices from API; no trial; 'incl. GST' line." */
  TRIAL_ENABLED: envFlag("FYNROX_TRIAL_ENABLED", false),
  SHOW_GST_INCLUSIVE_LINE: envFlag("FYNROX_SHOW_GST_INCLUSIVE_LINE", true),

  /**
   * D7 — "Values from config, shown as 'example'". Until the reward
   * values are approved, Refer & Earn must label them as illustrative;
   * shipping an unlabelled number would be a commercial promise.
   */
  REFERRAL_REWARDS_ARE_EXAMPLES: envFlag("FYNROX_REFERRAL_REWARDS_ARE_EXAMPLES", true),

  /** D10 — "Hide buttons" until real store URLs exist. */
  SHOW_APP_STORE_BUTTONS: envFlag("FYNROX_SHOW_APP_STORE_BUTTONS", false),

  /** D11 — "48 hours, 3 re-matches, then Admin queue." */
  OFFER_EXPIRY_HOURS: envInt("FYNROX_OFFER_EXPIRY_HOURS", 48),
  MAX_REMATCH_ATTEMPTS: envInt("FYNROX_MAX_REMATCH_ATTEMPTS", 3),

  /** D12 — "Later; hide entry point." */
  PROFESSIONAL_AI_ENABLED: envFlag("FYNROX_PROFESSIONAL_AI_ENABLED", false),

  /**
   * D13 — "Placeholders; block production release." A deployment that
   * sets this to true is asserting legal sign-off happened; until then
   * the legal pages render their placeholder banner.
   */
  LEGAL_TEXT_APPROVED: envFlag("FYNROX_LEGAL_TEXT_APPROVED", false),
} as const;

export type R1Flags = typeof r1Flags;

/**
 * D14 — "Heart condition → Pause; others → warning + consent."
 *
 * Until this shipped, `users.service.ts` escalated on *any* declared
 * condition or injury, which made acceptance test 5 ("selecting a
 * serious health condition shows the Safety Pause screen") vacuously
 * true and the warning path unreachable. Matching is substring-based on
 * a normalised string because onboarding stores free text, not a coded
 * vocabulary — a coded terminology is out of R1 scope ("no diagnosis or
 * treatment").
 */
export const SAFETY_PAUSE_CONDITION_KEYWORDS: readonly string[] = [
  "heart",
  "cardiac",
  "cardiovascular",
  "angina",
  "arrhythmia",
  "myocardial",
  "stroke",
  "pulmonary embolism",
  "chest pain",
];

export type SafetyOutcome = "pause" | "warning" | "none";

/**
 * Classifies declared conditions into D14's two tiers. Injuries alone
 * never pause — they are a plan-personalisation input, and the handoff
 * routes only "serious conditions" to the Safety Pause screen.
 */
export function classifySafetyOutcome(conditions: readonly string[]): SafetyOutcome {
  if (conditions.length === 0) return "none";
  const pauses = conditions.some((c) => {
    const norm = c.toLowerCase();
    return SAFETY_PAUSE_CONDITION_KEYWORDS.some((k) => norm.includes(k));
  });
  return pauses ? "pause" : "warning";
}
