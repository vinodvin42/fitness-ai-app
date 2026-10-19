/**
 * Brand constants — the single source of truth the R1 spec requires.
 *
 * "FynroX R1 — Final Design QA & Build Handoff" §2, decision "Brand":
 *
 * > The product name is FynroX on every surface. The AI is FynroX AI. The
 * > paid tier is FynroX Premium. Domains: fynrox.app for links,
 * > fynrox.com for email. Keep the name in one config constant
 * > (BRAND_NAME) and one logo component so a rename is one change.
 *
 * Nothing outside this file may hard-code a product name, a domain or a
 * support address. QA defect Q1 (FynroX / FynroX AI / FynroX),
 * Q4 (mixed link domains and casing) and Q5 (@FynroX.com in capitals)
 * all exist because the previous build had no such constant.
 *
 * CASING, 3 Oct 2026 — the quoted passage above is left verbatim
 * because it is what the handoff document says. It is no longer what
 * the product is called. The delivered logo wordmark reads "Fynrox",
 * the owner confirmed that spelling, and the constants below follow the
 * logo rather than the spec. Treat the quote as a record of the handoff,
 * not as the current answer; "FynroX" should not appear on any surface.
 */

/** Product name, everywhere. */
export const BRAND_NAME = "Fynrox";

/** The AI assistant's name. Never "Fynrox's AI" — it is a proper noun. */
export const BRAND_AI_NAME = "Fynrox AI";

/**
 * The logo mark: a running figure that forms an "F", in a cyan-to-blue
 * gradient (logo supplied 16 Oct 2026, replacing every earlier mark).
 *
 * It is artwork, not a path, so each app ships its own PNG copy (React
 * Native and Vite only bundle files inside the app). All are generated
 * from the one supplied image; the mark has a transparent background and
 * keeps its colours on light and dark surfaces. App icons and favicons
 * put it on a black tile.
 * Source artwork: docs/brand/fynrox-logo-source.png (regenerate every size from it).
 *   apps/{user,coach}-mobile/assets/logo-mark.png  (+ icon, adaptive-icon, splash-icon, favicon)
 *   apps/{admin-web,creator-portal,gym-portal}/src/assets/logo-mark.png, public/favicon.png, public/apple-touch-icon.png
 *   apps/landing/assets/brand/{logo-mark,favicon,apple-touch-icon}.png  (landing has no build step; its pages link these directly)
 */
/** @deprecated The "FX" initials are not a logo; use the logo-mark.png artwork. */
export const BRAND_MARK = "FX";

/** The single R1 paid tier (see `r1Flags.SINGLE_PREMIUM_TIER`). */
export const BRAND_PREMIUM_NAME = "Fynrox Premium";

/**
 * Link domain. Lowercase — Q4/Q5 are both casing defects, so the
 * constants are pre-lowercased and the builders below never upper-case.
 */
export const BRAND_LINK_DOMAIN = "fynrox.app";

/** Email domain. Distinct from the link domain by decision. */
export const BRAND_EMAIL_DOMAIN = "fynrox.com";

export const BRAND_SUPPORT_EMAIL = `support@${BRAND_EMAIL_DOMAIN}`;
export const BRAND_NOREPLY_EMAIL = `noreply@${BRAND_EMAIL_DOMAIN}`;
export const BRAND_PRIVACY_EMAIL = `privacy@${BRAND_EMAIL_DOMAIN}`;

/** `https://fynrox.app` — no trailing slash, so callers can append a path. */
export const BRAND_LINK_BASE_URL = `https://${BRAND_LINK_DOMAIN}`;

/**
 * Gym invite link. Handoff §7 "Link fix": the Figma shows
 * `app.example/gym/HYD-001`; the correct value is
 * `fynrox.app/gym/{gymCode}`, lowercase host, code as-issued.
 */
export function gymInviteUrl(gymCode: string): string {
  return `${BRAND_LINK_BASE_URL}/gym/${gymCode}`;
}

/**
 * Creator referral link — `fynrox.app/r/{creatorCode}`. The Figma shows
 * both `Fynrox.app/r/aashish24` and `app.example/r/aashish24`; neither
 * is correct.
 */
export function creatorReferralUrl(creatorCode: string): string {
  return `${BRAND_LINK_BASE_URL}/r/${creatorCode}`;
}

/**
 * User referral link. Same shape as the creator link by design — §9 Q12
 * says the two code *types* are told apart by prefix and by the API,
 * not by the URL.
 */
export function userReferralUrl(userCode: string): string {
  return `${BRAND_LINK_BASE_URL}/r/${userCode}`;
}

/**
 * QA defect Q12: "User and creator referral codes look alike
 * (FYNROX vs AASHISH24). User codes start FX-; creator codes stay
 * plain; the API tells them apart by type."
 *
 * The prefix is part of the stored code, not display sugar — a user
 * pasting `FX-7K2M9QRS` and a user pasting `7K2M9QRS` must resolve to
 * the same account, which is why `normalizeReferralCode` exists rather
 * than a bare `toUpperCase()` at every call site.
 */
export const USER_REFERRAL_CODE_PREFIX = "FX-";

export function isUserReferralCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith(USER_REFERRAL_CODE_PREFIX);
}

/**
 * Upper-cases, trims, and tolerates a missing or lower-case `FX-` prefix
 * on a user code. Creator codes pass through unchanged apart from
 * case/whitespace, so a single input box can accept either type — which
 * is exactly what U-M12 ("Have a code?" in onboarding) and U-M1
 * ("Have a code?" at checkout) need.
 */
export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}
