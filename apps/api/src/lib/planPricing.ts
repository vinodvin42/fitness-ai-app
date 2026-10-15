import { prisma } from "../db/prisma";
import { recordAudit } from "../middleware/auditLog";

/**
 * Plan prices on a schedule (decisions D8/D18, Oct 2026).
 *
 * `SubscriptionPlan.priceCents` is always the price in force today. A
 * scheduled `PlanPriceChange` becomes that price on its `effectiveFrom`
 * date. There is no cron in this build, so every place that reads a plan
 * price first calls `applyDuePlanPriceChanges()`; the work is a single
 * indexed query when nothing is due.
 *
 * Who pays what:
 * - New purchases and renewals pay the plan price on the day they pay.
 * - A subscriber who already paid keeps that price for the period they paid
 *   for (`Subscription.priceCents`), so "existing subscribers keep ₹299
 *   until their next renewal after 1 Dec" needs no special case.
 */
export async function applyDuePlanPriceChanges(now: Date = new Date()): Promise<number> {
  const due = await prisma.planPriceChange.findMany({
    where: { status: "scheduled", effectiveFrom: { lte: now } },
    orderBy: { effectiveFrom: "asc" },
  });
  let applied = 0;
  for (const change of due) {
    // Claim first so two requests can never apply the same change twice.
    const claimed = await prisma.planPriceChange.updateMany({
      where: { id: change.id, status: "scheduled" },
      data: { status: "applied", appliedAt: now },
    });
    if (claimed.count === 0) continue;
    await prisma.subscriptionPlan.update({ where: { id: change.planId }, data: { priceCents: change.priceCents } });
    await recordAudit({
      action: "plan.price_change_applied",
      entityType: "SubscriptionPlan",
      entityId: change.planId,
      stateBefore: { priceCents: change.previousCents },
      stateAfter: { priceCents: change.priceCents },
      metadata: { priceChangeId: change.id, effectiveFrom: change.effectiveFrom.toISOString() },
    });
    applied++;
  }
  return applied;
}

export interface UpcomingPrice {
  priceCents: number;
  effectiveFrom: string;
}

/** The next scheduled price for each plan (if any), so apps can show "₹349 from 1 Dec". */
export async function upcomingPrices(planIds: string[]): Promise<Map<string, UpcomingPrice>> {
  const map = new Map<string, UpcomingPrice>();
  if (planIds.length === 0) return map;
  const changes = await prisma.planPriceChange.findMany({
    where: { planId: { in: planIds }, status: "scheduled" },
    orderBy: { effectiveFrom: "asc" },
  });
  for (const c of changes) {
    if (!map.has(c.planId)) map.set(c.planId, { priceCents: c.priceCents, effectiveFrom: c.effectiveFrom.toISOString() });
  }
  return map;
}

/** Statuses that count as a current subscriber for notice rules. */
export const CURRENT_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"] as const;

/** At least this much notice before a price increase reaches current subscribers (D8). */
export const PRICE_INCREASE_NOTICE_DAYS = 30;
