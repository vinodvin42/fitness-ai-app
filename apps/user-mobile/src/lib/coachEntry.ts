import { r1Flags } from "@fitness-ai-app/config";

/**
 * Whether people can browse coaches themselves (CoachDiscovery and the
 * coach profile/booking screens behind it).
 *
 * Off — the R1 default (§2 decision #4) — a coach is found by sending a
 * request the FynroX team matches (RequestGuidance). Every "Find a coach"
 * button reads this one value, so none of them can open browsing screens
 * that are switched off. Paying a coach who has already accepted does NOT
 * depend on it: that step is always offered, and the API refuses the
 * payment itself when it must.
 */
export const COACH_BROWSING_ENABLED = r1Flags.PROFESSIONAL_MARKETPLACE_ENABLED;
