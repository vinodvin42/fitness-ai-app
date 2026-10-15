import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
  applyDuePlanPriceChanges,
  CURRENT_SUBSCRIPTION_STATUSES,
  PRICE_INCREASE_NOTICE_DAYS,
} from "../../lib/planPricing";
import { createNotification } from "../notifications/notifications.service";
import { CreatePlanInput, ListPlansQuery, SchedulePriceChangeInput, UpdatePlanInput } from "./adminPlans.schema";

/**
 * Module 06.05 — Pricing (docs/admin/03-screen-inventory.md §06.05), added
 * 25 Aug 2026. The Figma spec is "a plans table and a separate coupons
 * table" — this ships the plans half only, backed by the real
 * `SubscriptionPlan` model that's existed since Phase 0 but, until now, was
 * `scripts/seed.ts`-only: no admin anywhere in this build could create,
 * edit, or retire a plan. This is the first code that can.
 *
 * What's real: create, edit (any field), and a reversible Archive/Reactivate
 * via a new `isActive` column (see that field's own doc comment in
 * `prisma/schema.prisma` for why this is a state flip and not a delete —
 * same "no delete, an irreversible blast radius" reasoning `adminPrograms`
 * already established for Program/Exercise/Recipe, doubled here since a
 * deleted plan would orphan real `Subscription`/`Payment` rows, not just
 * hypothetical ones). `apps/api/src/modules/subscriptions`'s `listPlans()`
 * (the mobile-facing discovery endpoint) was updated in the same pass to
 * only return `isActive: true` plans — archiving a plan here genuinely
 * removes it from what a new mobile subscriber can pick, without touching
 * anyone already on it. `subscriberCount` is a real, all-time `Subscription`
 * row count (every status, not just currently-active) — a plan's full
 * adoption history, not just its current live book.
 *
 * **Coupons are deliberately NOT built** — no `Coupon` entity exists
 * anywhere in this build (no discount-code field anywhere in the checkout
 * flow to apply one against), so a coupons table would be empty by
 * construction, the same reasoning that excluded `RelationshipChangeRequest`
 * (04.03) and `EducationalContent` (05.04). The frontend renders
 * `NotAvailablePanel` for it rather than an empty or fabricated table.
 *
 * **25 Aug 2026: real per-role RBAC gates this module too** —
 * `requirePermission("commerce", ...)` (see `middleware/adminPermissions.ts`)
 * on every route below, not just a session check.
 */

type PlanRow = {
  id: string;
  name: string;
  tier: string;
  billingCycle: string;
  priceCents: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { subscriptions: number };
  priceChanges?: PriceChangeRow[];
};

type PriceChangeRow = {
  id: string;
  priceCents: number;
  previousCents: number;
  effectiveFrom: Date;
  status: string;
  reason: string | null;
  noticeSentAt: Date | null;
  appliedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
};

function toPriceChange(c: PriceChangeRow) {
  return {
    id: c.id,
    priceCents: c.priceCents,
    previousCents: c.previousCents,
    effectiveFrom: c.effectiveFrom,
    status: c.status,
    reason: c.reason,
    noticeSentAt: c.noticeSentAt,
    appliedAt: c.appliedAt,
    cancelledAt: c.cancelledAt,
    createdAt: c.createdAt,
  };
}

function toPlanListItem(p: PlanRow & { priceChanges?: PriceChangeRow[] }) {
  return {
    id: p.id,
    name: p.name,
    tier: p.tier,
    billingCycle: p.billingCycle,
    priceCents: p.priceCents,
    isActive: p.isActive,
    subscriberCount: p._count.subscriptions,
    // D8: upcoming prices, newest schedule last; applied/cancelled history
    // is in the audit log.
    scheduledPriceChanges: (p.priceChanges ?? []).map(toPriceChange),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const PLAN_INCLUDE = {
  _count: { select: { subscriptions: true } },
  priceChanges: { where: { status: "scheduled" as const }, orderBy: { effectiveFrom: "asc" as const } },
};

export async function listPlans(query: ListPlansQuery) {
  await applyDuePlanPriceChanges();
  const rows = (await prisma.subscriptionPlan.findMany({
    include: PLAN_INCLUDE,
    orderBy: { priceCents: "asc" },
  })) as PlanRow[];

  const filtered = rows.filter(
    (r) =>
      (query.tier ? r.tier === query.tier : true) &&
      (query.billingCycle ? r.billingCycle === query.billingCycle : true) &&
      (query.status ? (query.status === "active") === r.isActive : true),
  );

  return {
    plans: filtered.map(toPlanListItem),
    counts: { total: rows.length, active: rows.filter((r) => r.isActive).length, archived: rows.filter((r) => !r.isActive).length },
    notAvailable: ["coupons"],
  };
}

async function getPlanOrThrow(id: string): Promise<PlanRow> {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id }, include: PLAN_INCLUDE });
  if (!plan) {
    throw new ApiHttpError(404, "not_found", "Plan not found");
  }
  return plan as PlanRow;
}

export async function createPlan(actorAdminId: string, input: CreatePlanInput) {
  const plan = await prisma.subscriptionPlan.create({ data: input });
  await recordAudit({
    actorAdminId,
    action: "plan.create",
    entityType: "SubscriptionPlan",
    entityId: plan.id,
    metadata: { name: input.name, tier: input.tier, priceCents: input.priceCents },
  });
  return toPlanListItem(await getPlanOrThrow(plan.id));
}

export async function updatePlan(actorAdminId: string, id: string, input: UpdatePlanInput) {
  const existing = await getPlanOrThrow(id);
  // D8: once anyone has subscribed, the price only changes through a
  // scheduled price change (start date, notice, subscribers keep what they
  // paid). A plan nobody has bought yet can still be priced directly.
  if (input.priceCents !== undefined && input.priceCents !== existing.priceCents && existing._count.subscriptions > 0) {
    throw new ApiHttpError(
      409,
      "use_scheduled_price_change",
      "This plan has subscribers. Schedule the new price with a start date instead (POST /admin/plans/:id/price-changes).",
    );
  }
  await prisma.subscriptionPlan.update({ where: { id }, data: input });
  await recordAudit({ actorAdminId, action: "plan.update", entityType: "SubscriptionPlan", entityId: id, metadata: input });
  return toPlanListItem(await getPlanOrThrow(id));
}

export async function archivePlan(actorAdminId: string, id: string) {
  const plan = await getPlanOrThrow(id);
  if (!plan.isActive) {
    throw new ApiHttpError(409, "plan_already_archived", "This plan is already archived");
  }
  await prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false } });
  await recordAudit({ actorAdminId, action: "plan.archive", entityType: "SubscriptionPlan", entityId: id });
  return toPlanListItem(await getPlanOrThrow(id));
}

export async function reactivatePlan(actorAdminId: string, id: string) {
  const plan = await getPlanOrThrow(id);
  if (plan.isActive) {
    throw new ApiHttpError(409, "plan_already_active", "This plan is already active");
  }
  await prisma.subscriptionPlan.update({ where: { id }, data: { isActive: true } });
  await recordAudit({ actorAdminId, action: "plan.reactivate", entityType: "SubscriptionPlan", entityId: id });
  return toPlanListItem(await getPlanOrThrow(id));
}

const IST_OFFSET_MS = 330 * 60 * 1000;

/** The first midnight in India at or after `date`. */
function indiaMidnightOnOrAfter(date: Date): Date {
  const local = new Date(date.getTime() + IST_OFFSET_MS);
  const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const midnight = midnightLocal - IST_OFFSET_MS;
  return new Date(midnight >= date.getTime() ? midnight : midnight + 24 * 60 * 60 * 1000);
}

/** `YYYY-MM-DD` of a moment, in India time. */
function indiaDate(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` means midnight India time on that date; anything else is a full timestamp. */
function parseEffectiveFrom(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+05:30` : value);
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * Schedules a plan price change (decisions D8/D18). Runs only for the Super
 * Admin; anyone else's call becomes an approval request (commerce:edit).
 *
 * - The start date can't be in the past.
 * - A price increase on a plan with current subscribers needs at least
 *   30 days' notice, and each current subscriber gets an in-app notice now.
 * - Subscribers keep what they paid for the current period; the new price
 *   applies to new purchases and renewals from the start date.
 */
export async function schedulePriceChange(actorAdminId: string, planId: string, input: SchedulePriceChangeInput) {
  await applyDuePlanPriceChanges();
  const plan = await getPlanOrThrow(planId);
  const effectiveFrom = parseEffectiveFrom(input.effectiveFrom);
  const now = new Date();
  if (effectiveFrom.getTime() < now.getTime() - 60_000) {
    throw new ApiHttpError(422, "start_date_in_past", "The new price can't start in the past");
  }
  // Compare with the price that will be in force just before the new start
  // date (a change already scheduled before it counts), not just today's —
  // otherwise a decrease then an increase could dodge the notice rule.
  const priorScheduled = await prisma.planPriceChange.findFirst({
    where: { planId, status: "scheduled", effectiveFrom: { lt: effectiveFrom } },
    orderBy: { effectiveFrom: "desc" },
  });
  const baselineCents = priorScheduled?.priceCents ?? plan.priceCents;
  if (input.priceCents === baselineCents) {
    throw new ApiHttpError(422, "price_unchanged", "That is already the price on that date");
  }

  const currentSubscribers = await prisma.subscription.findMany({
    where: { planId, status: { in: [...CURRENT_SUBSCRIPTION_STATUSES] } },
    select: { userId: true },
  });
  const isIncrease = input.priceCents > baselineCents || input.priceCents > plan.priceCents;
  const minStart = indiaMidnightOnOrAfter(new Date(now.getTime() + PRICE_INCREASE_NOTICE_DAYS * 24 * 60 * 60 * 1000));
  if (isIncrease && currentSubscribers.length > 0 && effectiveFrom.getTime() < minStart.getTime()) {
    throw new ApiHttpError(
      422,
      "notice_too_short",
      `A price increase needs at least ${PRICE_INCREASE_NOTICE_DAYS} days' notice because this plan has ${currentSubscribers.length} subscriber(s). Pick a start date on or after ${indiaDate(minStart)}.`,
    );
  }

  const clash = await prisma.planPriceChange.findFirst({ where: { planId, status: "scheduled", effectiveFrom } });
  if (clash) {
    throw new ApiHttpError(409, "price_change_exists", "A price change is already scheduled for that date. Cancel it first.");
  }

  let change;
  try {
    change = await prisma.planPriceChange.create({
      data: {
        planId,
        priceCents: input.priceCents,
        previousCents: baselineCents,
        effectiveFrom,
        reason: input.reason ?? null,
        createdByAdminId: actorAdminId,
      },
    });
  } catch (err) {
    // The database's one-scheduled-change-per-date index caught a duplicate
    // sent at the same moment.
    if ((err as { code?: string }).code === "P2002") {
      throw new ApiHttpError(409, "price_change_exists", "A price change is already scheduled for that date. Cancel it first.");
    }
    throw err;
  }

  // Tell current subscribers now (in-app). Sent as a `system` notice so
  // notification preferences can't hide a price change (createNotification
  // never throws).
  if (currentSubscribers.length > 0) {
    const dateText = effectiveFrom.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
    const userIds: string[] = [...new Set<string>(currentSubscribers.map((s: { userId: string }) => s.userId))];
    for (const userId of userIds) {
      await createNotification(userId, {
        kind: "system",
        title: `${plan.name} price change`,
        body: `From ${dateText}, ${plan.name} will be ${formatRupees(input.priceCents)} per ${plan.billingCycle === "annual" ? "year" : plan.billingCycle === "quarterly" ? "3 months" : "month"}. You keep your current price until your next renewal on or after that date.`,
        deepLink: "fynrox://subscription",
      });
    }
    await prisma.planPriceChange.update({ where: { id: change.id }, data: { noticeSentAt: new Date() } });
  }

  await recordAudit({
    actorAdminId,
    action: "plan.price_change_scheduled",
    entityType: "SubscriptionPlan",
    entityId: planId,
    stateBefore: { priceCents: plan.priceCents },
    stateAfter: { priceCents: input.priceCents, effectiveFrom: effectiveFrom.toISOString() },
    metadata: { priceChangeId: change.id, subscribersNotified: currentSubscribers.length },
  });

  return toPlanListItem(await getPlanOrThrow(planId));
}

/** Cancels a price change that has not started yet. */
export async function cancelPriceChange(actorAdminId: string, planId: string, changeId: string) {
  const cancelled = await prisma.planPriceChange.updateMany({
    where: { id: changeId, planId, status: "scheduled" },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  if (cancelled.count === 0) {
    throw new ApiHttpError(409, "price_change_not_scheduled", "Only a price change that hasn't started can be cancelled");
  }
  await recordAudit({
    actorAdminId,
    action: "plan.price_change_cancelled",
    entityType: "SubscriptionPlan",
    entityId: planId,
    metadata: { priceChangeId: changeId },
  });
  return toPlanListItem(await getPlanOrThrow(planId));
}
