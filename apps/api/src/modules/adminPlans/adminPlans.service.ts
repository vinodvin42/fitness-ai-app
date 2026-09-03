import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { CreatePlanInput, ListPlansQuery, UpdatePlanInput } from "./adminPlans.schema";

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
};

function toPlanListItem(p: PlanRow) {
  return {
    id: p.id,
    name: p.name,
    tier: p.tier,
    billingCycle: p.billingCycle,
    priceCents: p.priceCents,
    isActive: p.isActive,
    subscriberCount: p._count.subscriptions,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const PLAN_INCLUDE = { _count: { select: { subscriptions: true } } };

export async function listPlans(query: ListPlansQuery) {
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
  await getPlanOrThrow(id);
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
