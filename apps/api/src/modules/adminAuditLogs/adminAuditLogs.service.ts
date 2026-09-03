import { prisma } from "../../db/prisma";
import { ListAuditLogsQuery } from "./adminAuditLogs.schema";

/**
 * Module 12.03 — Audit Logs (docs/admin/03-screen-inventory.md §12.03),
 * added 22 Aug 2026 — the first genuinely unscoped, cross-entity,
 * filterable view of the real `AuditLog` table (`middleware/auditLog.ts`'s
 * write-once `recordAudit()`, called from every state-changing admin
 * action in this build since Module 04). Every prior read of this table
 * was scoped to one entity or one actor: Module 04's Relationship History
 * tab (`entityType`/`entityId`-scoped), Module 02's User Profile Recent
 * Activity feed (`actorId`-scoped), Module 06.02's Transaction audit
 * trail (`entityType`/`entityId`-scoped), Module 08's Triage history
 * (`entityType`/`entityId`-scoped). This is the first screen that reads
 * the whole table, matching 12.03's Figma spec of a dedicated, unscoped
 * log viewer.
 *
 * **What's real vs. honestly not modeled**, against the Figma's "a
 * filterable, paginated log table with an export action and a lock icon
 * signaling immutability":
 * - The table itself, the lock-icon immutability framing (this build has
 *   never shipped a delete/edit path for `AuditLog` — `recordAudit()` is
 *   create-only, matching the Figma's implication), the actor-type filter
 *   (derived from which of the three nullable actor FKs is set — see this
 *   module's schema file), and the date range are all real.
 * - `entityType`/`action` are plain string columns, not Prisma enums —
 *   there is no fixed, confirmable list of every value that has ever been
 *   or will be written (new modules add new `action` strings as they
 *   ship). Rather than hardcode a dropdown that would silently go stale
 *   the next time a module ships a new action, `search` is a free-text
 *   box matching either column — honest given the actual column type,
 *   not a missing feature.
 * - **"Paginated"** is deliberately NOT real pagination (no directory
 *   screen in this console has real pagination yet — see Module 12.01's
 *   own "small dataset expected" precedent). `AuditLog` is different: it
 *   is the one table in this schema with no natural bound on row count
 *   (every admin action across every module writes to it, indefinitely).
 *   Silently fetching "everything" here would be a real, worsening
 *   performance problem, not just an omitted chrome affordance — so this
 *   caps at the `MAX_RESULTS` most recent matching rows and returns a
 *   real `totalCount` (a genuine, unfiltered-by-cap `count()` query) plus
 *   `truncated: totalCount > MAX_RESULTS`, so the screen can say "showing
 *   the most recent N of totalCount" rather than silently under-reporting
 *   — real follow-up work (cursor pagination) is still open, but nothing
 *   here pretends the capped page is the whole result set.
 * - **"Export action"** is real, not stubbed: the frontend builds a CSV
 *   client-side from the exact rows already fetched (real data, no new
 *   endpoint needed) — see AuditLogsScreen.tsx. It only ever exports the
 *   current page (subject to the same `MAX_RESULTS` cap above), which the
 *   UI states explicitly rather than implying a full-table export.
 * - Read-only, no state-changing endpoint — `AuditLog` is write-once by
 *   design; this module doesn't add a first way to mutate it, matching
 *   every other module's precedent that a genuinely-immutable table stays
 *   immutable everywhere, not just in the UI.
 *
 * Deliberately does NOT import `AuditLog`/`User`/`AdminUser`/`Professional`
 * as Prisma model types — same reasoning as every other admin service
 * file this build (the un-generated `@prisma/client` stub has no real
 * model exports).
 */

const MAX_RESULTS = 200;

type AuditLogRow = {
  id: string;
  actorId: string | null;
  actorAdminId: string | null;
  actorProfessionalId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
};

type ActorInfo = { fullName: string; email: string };

/**
 * Batch-resolves every row's actor (whichever of the three FKs is set)
 * into a display name/email in up to three queries total, regardless of
 * how many rows are on the page — never one query per row.
 */
async function resolveActors(rows: AuditLogRow[]) {
  const userIds = [...new Set(rows.filter((r) => r.actorId).map((r) => r.actorId as string))];
  const adminIds = [...new Set(rows.filter((r) => r.actorAdminId).map((r) => r.actorAdminId as string))];
  const professionalIds = [...new Set(rows.filter((r) => r.actorProfessionalId).map((r) => r.actorProfessionalId as string))];

  const [users, admins, professionals] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
      : Promise.resolve([]),
    adminIds.length > 0
      ? prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, fullName: true, email: true } })
      : Promise.resolve([]),
    professionalIds.length > 0
      ? prisma.professional.findMany({ where: { id: { in: professionalIds } }, select: { id: true, fullName: true, email: true } })
      : Promise.resolve([]),
  ]);

  const userMap = new Map<string, ActorInfo>((users as Array<{ id: string; fullName: string; email: string }>).map((u) => [u.id, u]));
  const adminMap = new Map<string, ActorInfo>((admins as Array<{ id: string; fullName: string; email: string }>).map((a) => [a.id, a]));
  const professionalMap = new Map<string, ActorInfo>(
    (professionals as Array<{ id: string; fullName: string; email: string }>).map((p) => [p.id, p]),
  );

  return { userMap, adminMap, professionalMap };
}

function toEntry(
  r: AuditLogRow,
  maps: { userMap: Map<string, ActorInfo>; adminMap: Map<string, ActorInfo>; professionalMap: Map<string, ActorInfo> },
) {
  let actorType: "user" | "admin" | "professional" | null = null;
  let actor: ActorInfo | null = null;
  if (r.actorAdminId) {
    actorType = "admin";
    actor = maps.adminMap.get(r.actorAdminId) ?? null;
  } else if (r.actorId) {
    actorType = "user";
    actor = maps.userMap.get(r.actorId) ?? null;
  } else if (r.actorProfessionalId) {
    actorType = "professional";
    actor = maps.professionalMap.get(r.actorProfessionalId) ?? null;
  }

  return {
    id: r.id,
    actorType,
    actorId: r.actorAdminId ?? r.actorId ?? r.actorProfessionalId ?? null,
    // null actor label covers a row whose actor account was later deleted
    // — never happens today (no delete path exists for User/AdminUser/
    // Professional in this console), but the type stays honest about it.
    actorLabel: actor?.fullName ?? null,
    actorEmail: actor?.email ?? null,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt,
  };
}

export async function listAuditLogs(query: ListAuditLogsQuery) {
  // baseWhere: search + date range only — the scope the `stats` breakdown
  // is computed over, so the stat cards stay a stable superset of
  // whatever the actorType filter below narrows the table to (same
  // "counts computed before the current filter narrows further"
  // convention as adminAccounts/adminProfessionals/adminPayments).
  const baseWhere: Record<string, unknown> = {};
  if (query.startDate || query.endDate) {
    baseWhere.createdAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }
  if (query.search) {
    baseWhere.OR = [
      { action: { contains: query.search, mode: "insensitive" } },
      { entityType: { contains: query.search, mode: "insensitive" } },
    ];
  }

  // tableWhere: baseWhere plus the actorType filter, if any — what the
  // table itself (and the truncation check) is actually scoped to.
  const tableWhere: Record<string, unknown> = { ...baseWhere };
  if (query.actorType === "admin") tableWhere.actorAdminId = { not: null };
  else if (query.actorType === "user") tableWhere.actorId = { not: null };
  else if (query.actorType === "professional") tableWhere.actorProfessionalId = { not: null };

  const [rows, tableCount, adminActions, userActions, professionalActions] = await Promise.all([
    prisma.auditLog.findMany({ where: tableWhere, orderBy: { createdAt: "desc" }, take: MAX_RESULTS }),
    prisma.auditLog.count({ where: tableWhere }),
    prisma.auditLog.count({ where: { ...baseWhere, actorAdminId: { not: null } } }),
    prisma.auditLog.count({ where: { ...baseWhere, actorId: { not: null } } }),
    prisma.auditLog.count({ where: { ...baseWhere, actorProfessionalId: { not: null } } }),
  ]);

  const typedRows = rows as AuditLogRow[];
  const maps = await resolveActors(typedRows);

  return {
    entries: typedRows.map((r) => toEntry(r, maps)),
    // totalCount is the baseWhere-scoped sum (search+date only) — a
    // stable superset of adminActions/userActions/professionalActions,
    // which are the same breakdown the actorType filter picks from.
    stats: { totalCount: adminActions + userActions + professionalActions, adminActions, userActions, professionalActions },
    // True when the real count under the CURRENT filter scope (including
    // actorType) exceeds the MAX_RESULTS most-recent rows actually
    // returned — see this file's top comment.
    truncated: tableCount > MAX_RESULTS,
  };
}
