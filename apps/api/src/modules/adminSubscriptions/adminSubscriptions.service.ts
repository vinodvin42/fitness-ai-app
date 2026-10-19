import { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ListSubscriptionsQuery } from "./adminSubscriptions.schema";

/**
 * 06.01 Subscriptions (docs/admin/03-screen-inventory.md §06.01), Oct 2026:
 * the subscription list the spec's Subscriptions tab names, over the real
 * `Subscription` + `SubscriptionPlan` rows. The spec's revenue waterfall
 * already lives at Finance → Revenue waterfall, so it isn't repeated here.
 *
 * Price: a subscriber's locked price (`Subscription.priceCents`, kept when a
 * plan's price later changes) when there is one, else the plan's current
 * price — `priceLocked` says which. Status counts are over ALL
 * subscriptions, not the filtered set, so the KPI row doesn't jump while
 * filtering. The list shows the newest 500 matches (`truncated` says when
 * there are more) — the console has no paging anywhere else either.
 *
 * Not available: a country breakdown (no country is stored for users).
 */

const LIST_LIMIT = 500;

const listInclude = {
  user: { select: { id: true, fullName: true, email: true } },
  plan: { select: { id: true, name: true, tier: true, billingCycle: true, priceCents: true } },
} satisfies Prisma.SubscriptionInclude;

type Row = Prisma.SubscriptionGetPayload<{ include: typeof listInclude }>;

function toListItem(s: Row) {
  return {
    id: s.id,
    status: s.status,
    user: s.user,
    plan: s.plan,
    priceCents: s.priceCents ?? s.plan.priceCents,
    priceLocked: s.priceCents != null,
    renewsAt: s.renewsAt,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    revokedAt: s.revokedAt,
    revokedReason: s.revokedReason,
    createdAt: s.createdAt,
  };
}

export async function listSubscriptions(query: ListSubscriptionsQuery) {
  const planWhere: Prisma.SubscriptionPlanWhereInput = {
    ...(query.tier ? { tier: query.tier } : {}),
    ...(query.billingCycle ? { billingCycle: query.billingCycle } : {}),
  };
  const where: Prisma.SubscriptionWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(Object.keys(planWhere).length ? { plan: planWhere } : {}),
    ...(query.search
      ? {
          user: {
            OR: [
              { fullName: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [rows, matched, byStatus] = await Promise.all([
    prisma.subscription.findMany({ where, include: listInclude, orderBy: { createdAt: "desc" }, take: LIST_LIMIT }),
    prisma.subscription.count({ where }),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(Object.values(SubscriptionStatus).map((st) => [st, 0])) as Record<SubscriptionStatus, number>;
  for (const g of byStatus) counts[g.status] = g._count._all;

  return {
    subscriptions: rows.map(toListItem),
    matched,
    truncated: matched > rows.length,
    counts,
    notAvailable: ["country"],
  };
}
