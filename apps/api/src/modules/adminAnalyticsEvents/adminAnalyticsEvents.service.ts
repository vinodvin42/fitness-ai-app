import { prisma } from "../../db/prisma";
import { ListAnalyticsEventsQuery } from "./adminAnalyticsEvents.schema";

/**
 * U7 (15 Sep 2026) — the minimal, real, paginated read path §8/§7's
 * product-analytics event stream needs to prove it's genuinely queryable,
 * not a full dashboard (explicitly not required this pass — see this
 * session's own instructions). Same `MAX_RESULTS`-capped-plus-honest-
 * `truncated`-flag shape as adminAuditLogs.service.ts's `listAuditLogs`,
 * for the identical reason: `AnalyticsEvent`, like `AuditLog`, has no
 * natural bound on row count (every tracked event across every module
 * writes here, indefinitely), so silently fetching "everything" would be
 * a real, worsening performance problem.
 */

const MAX_RESULTS = 200;

type AnalyticsEventRow = {
  id: string;
  userId: string;
  name: string;
  entityIds: unknown;
  ruleId: string | null;
  metadata: unknown;
  occurredAt: Date;
};

export async function listAnalyticsEvents(query: ListAnalyticsEventsQuery) {
  const where: Record<string, unknown> = {};
  if (query.userId) where.userId = query.userId;
  if (query.name) where.name = { contains: query.name, mode: "insensitive" };
  if (query.startDate || query.endDate) {
    where.occurredAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }

  const [rows, totalCount] = await Promise.all([
    prisma.analyticsEvent.findMany({ where, orderBy: { occurredAt: "desc" }, take: MAX_RESULTS }),
    prisma.analyticsEvent.count({ where }),
  ]);

  const typedRows = rows as AnalyticsEventRow[];
  const userIds = [...new Set(typedRows.map((r) => r.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
    : [];
  const userMap = new Map<string, { fullName: string; email: string }>(
    (users as Array<{ id: string; fullName: string; email: string }>).map((u) => [u.id, u]),
  );

  return {
    entries: typedRows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userLabel: userMap.get(r.userId)?.fullName ?? null,
      userEmail: userMap.get(r.userId)?.email ?? null,
      name: r.name,
      entityIds: (r.entityIds as Record<string, unknown> | null) ?? null,
      ruleId: r.ruleId,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      occurredAt: r.occurredAt,
    })),
    totalCount,
    truncated: totalCount > MAX_RESULTS,
  };
}
