import { prisma } from "../db/prisma";
import { recordAudit } from "../middleware/auditLog";
import { runOutsideChangeContext } from "./makerChecker";

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
  const duePlans = await prisma.planPriceChange.findMany({
    where: { status: "scheduled", effectiveFrom: { lte: now } },
    select: { planId: true },
    distinct: ["planId"],
  });
  let applied = 0;
  for (const { planId } of duePlans) {
    // One transaction per plan, with the plan row locked: the price and the
    // "applied" marks change together, two requests can't both apply, and
    // the latest due change always wins.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "subscription_plans" WHERE "id" = ${planId} FOR UPDATE`;
      const due = await tx.planPriceChange.findMany({
        where: { planId, status: "scheduled", effectiveFrom: { lte: now } },
        orderBy: { effectiveFrom: "asc" },
      });
      if (due.length === 0) return null;
      const latest = due[due.length - 1];
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId }, select: { priceCents: true } });
      await tx.planPriceChange.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { status: "applied", appliedAt: now },
      });
      await tx.subscriptionPlan.update({ where: { id: planId }, data: { priceCents: latest.priceCents } });
      return { latest, previous: plan?.priceCents ?? latest.previousCents, count: due.length };
    });
    if (!result) continue;
    applied += result.count;
    // A system action: keep the admin's reason/approval (if this runs inside
    // their request) off this audit entry.
    await runOutsideChangeContext(() =>
      recordAudit({
        action: "plan.price_change_applied",
        entityType: "SubscriptionPlan",
        entityId: planId,
        stateBefore: { priceCents: result.previous },
        stateAfter: { priceCents: result.latest.priceCents },
        metadata: { priceChangeId: result.latest.id, effectiveFrom: result.latest.effectiveFrom.toISOString() },
      }),
    );
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
