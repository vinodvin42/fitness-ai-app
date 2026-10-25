/**
 * Plans in the app come from the super admin portal (owner, 20 Oct 2026):
 * every plan switched on there is offered, at the price set there, and an
 * archived plan disappears. The app decides only what each tier includes (the
 * comparison ticks in SubscriptionScreen). Pure, so tests/planLineup.check.cjs
 * can run it in plain Node.
 */

export type PlanTier = "basic" | "grow" | "prime";

export const TIER_ORDER: PlanTier[] = ["basic", "grow", "prime"];

/** The free plan (Basic, or any plan priced at zero): nothing renews and nothing to cancel. */
export function isFreePlan(plan: { tier: string; priceCents: number }): boolean {
  return plan.tier === "basic" || plan.priceCents === 0;
}

/**
 * Owner, 21 Oct 2026: "basic plan never expire". The free plan is shown as a
 * plain, never-ending plan whatever older data says: no end date, never set to
 * cancel, never "expiring", and a free plan that lapsed that way reads as
 * active. Admin states (revoked, suspended, pending) are kept. The API does
 * the same since 21 Oct (settleFreePlan); this covers an API not yet updated.
 */
export function freePlanNeverEnds<
  T extends { plan: { tier: string; priceCents: number }; priceCents?: number | null; status: string; renewsAt: string | null; cancelAtPeriodEnd: boolean; displayState?: string },
>(sub: T): T {
  if (!isFreePlan(sub.plan) || (sub.priceCents ?? 0) > 0) return sub;
  const lapsed = sub.status === "expired";
  return {
    ...sub,
    renewsAt: null,
    cancelAtPeriodEnd: false,
    status: lapsed ? "active" : sub.status,
    ...(sub.displayState !== undefined
      ? { displayState: sub.displayState === "expiring" || sub.displayState === "expired" ? "active" : sub.displayState }
      : {}),
  };
}

// `key` is a catalogue key (`subscription.features.*`); the array carries only
// which tiers include what, which is the actual product decision.
// Owner, 20 Oct 2026: Basic (free) is workout and nutrition tracking, the
// progress timeline, reminders, AI coach chat and recovery logs; Prime is
// everything in Basic plus requesting a coach (billed separately) and
// priority support. The four Fynrox programs are bought separately on either.
// Grow is archived in the admin portal, so its column only shows if a Grow plan
// is switched on again; its ticks are the last decided ones (D13).
export const COMPARISON_FEATURES: Array<{ key: string } & Record<PlanTier, boolean>> = [
  { key: "tracking", basic: true, grow: true, prime: true },
  { key: "progress", basic: true, grow: true, prime: true },
  { key: "reminders", basic: true, grow: true, prime: true },
  { key: "aiCoach", basic: true, grow: true, prime: true },
  { key: "recovery", basic: true, grow: true, prime: true },
  { key: "humanCoaching", basic: false, grow: true, prime: true },
  { key: "prioritySupport", basic: false, grow: false, prime: true },
];

/** What a tier adds: everything in the tier below it, plus its own extras (COMPARISON_FEATURES). */
export function featuresFor(tier: PlanTier, lowerTier: PlanTier | null): string[] {
  return COMPARISON_FEATURES.filter((f) => f[tier] && (!lowerTier || !f[lowerTier])).map((f) => f.key);
}

/** Today's price is a launch offer when a higher price is already scheduled for later. */
export function hasLaunchOffer(plan: { priceCents: number; upcomingPrice?: { priceCents: number } | null }): boolean {
  return !!plan.upcomingPrice && plan.upcomingPrice.priceCents > plan.priceCents;
}

/**
 * The comparison's columns: each tier that has a plan on sale, in tier order,
 * named as the super admin named it (its monthly plan's name when it has one).
 */
export function comparisonColumns(plans: Array<{ tier: string; name: string; billingCycle: string }>): Array<{ tier: PlanTier; name: string }> {
  return TIER_ORDER.flatMap((tier) => {
    const inTier = plans.filter((p) => p.tier === tier);
    if (inTier.length === 0) return [];
    const named = inTier.find((p) => p.billingCycle === "monthly") ?? inTier[0];
    return [{ tier, name: named.name }];
  });
}
