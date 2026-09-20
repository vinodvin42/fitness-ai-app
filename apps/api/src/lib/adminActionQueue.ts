import { AdminActionItemSeverity, AdminActionItemType, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { recordAudit } from "../middleware/auditLog";
import { ApiHttpError } from "../middleware/errorHandler";

/**
 * Admin Action Required queue write-path (R2 Wave 1, 20 Sep 2026) — see
 * `AdminActionItem`'s own doc comment in schema.prisma for the full "why
 * a new real table, not a computed view" reasoning. This is the one
 * function every other module funnels through to add a row to the real,
 * unified exception queue — the same "single reusable helper, not a raw
 * `prisma.X.create` scattered at each site" shape as
 * `lib/analytics.ts`'s `trackEvent()`, deliberately a sibling to it (and
 * to `middleware/auditLog.ts`'s `recordAudit()`): `recordAudit()` owns
 * the admin-visible compliance trail, `trackEvent()` owns product
 * analytics, this owns "does a human admin need to look at this."
 *
 * Write-once, fire-and-forget from the CALLER's point of view — every
 * real call site in this codebase does `await createActionItem(...)`
 * (a real awaited write, not detached from the request lifecycle) but a
 * failure here must never fail the real mutation it's attached to (the
 * ticket/refund/escalation/etc. row is the source of truth; the queue
 * entry is a side-channel on top of it) — same discipline `recordAudit()`
 * and `trackEvent()` call sites already follow throughout this codebase.
 * Concretely: call this AFTER the real row it's about has already
 * committed, and don't let a caller's own try/catch swallow a real
 * failure of the primary mutation because of this.
 *
 * No dedup/upsert logic here on purpose, matching `trackEvent()`'s own
 * "real and simple" shape — every real ongoing call site below fires
 * from a genuine one-time creation moment (a ticket is created once, a
 * pending Refund reserved once, an Escalation raised once, a
 * RelationshipChangeRequest submitted once, a credential (re-)submitted
 * once, which is itself a new real review cycle worth a fresh queue row)
 * so a duplicate can't structurally occur from normal traffic. The
 * one-time historical backfill (`scripts/backfillAdminActionItems.ts`)
 * guards against double-seeding itself by checking for an existing row
 * per (type, entityType, entityId) before creating one — that dedup
 * concern is specific to a repeatable backfill script, not this function.
 */
export async function createActionItem(input: {
  type: AdminActionItemType;
  entityType: string;
  entityId: string;
  severity: AdminActionItemSeverity;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const item = await prisma.adminActionItem.create({
    data: {
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      severity: input.severity,
      // Cast to Prisma's JSON input type — same reasoning as
      // recordAudit()'s/trackEvent()'s own metadata casts.
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonObject } : {}),
    },
    select: { id: true },
  });
  return item;
}

type ListActionItemsQuery = {
  type?: AdminActionItemType;
  severity?: AdminActionItemSeverity;
  status?: "open" | "resolved";
  assignedToAdminId?: string;
};

/**
 * Minimal, filterable read side (GET /admin/action-items) — deliberately
 * not a paginated/sorted-by-priority dashboard response shape; that real
 * UI is explicitly Wave 4's own unit (see schema.prisma's doc comment).
 * This just needs to make the data genuinely inspectable via a real API
 * call for this wave's own verification and for whatever later wave
 * builds the real screen on top of it.
 */
export async function listActionItems(query: ListActionItemsQuery) {
  return prisma.adminActionItem.findMany({
    where: {
      ...(query.type ? { type: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToAdminId ? { assignedToAdminId: query.assignedToAdminId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

async function getActionItemOrThrow(id: string) {
  const item = await prisma.adminActionItem.findUnique({ where: { id } });
  if (!item) {
    throw new ApiHttpError(404, "action_item_not_found", "Admin action item not found");
  }
  return item;
}

/**
 * Real ownership — any admin who can see the queue can claim an item.
 * Reassignment (from one admin to another) is allowed on an already-open
 * item; the claim-once discipline that matters here belongs to
 * `resolveActionItem` below (a genuine one-time terminal transition),
 * not to who currently owns an open item.
 */
export async function assignActionItem(id: string, actorAdminId: string, assignToAdminId: string) {
  const item = await getActionItemOrThrow(id);
  if (item.status !== "open") {
    throw new ApiHttpError(409, "action_item_resolved", "This action item has already been resolved");
  }

  await prisma.adminActionItem.update({
    where: { id },
    data: { assignedToAdminId: assignToAdminId },
  });

  await recordAudit({
    actorAdminId,
    action: "admin_action_item.assigned",
    entityType: "AdminActionItem",
    entityId: id,
    metadata: { assignedToAdminId: assignToAdminId },
  });

  return getActionItemOrThrow(id);
}

/**
 * Same atomic claim-once discipline this codebase uses everywhere for a
 * one-time state transition (see payments.service.ts's activatePayment())
 * — `updateMany` filtered on `status: "open"` makes the claim itself
 * atomic, so two admins resolving the same item concurrently can never
 * both succeed: exactly one `updateMany` call actually affects a row.
 */
export async function resolveActionItem(id: string, actorAdminId: string, resolutionNote?: string) {
  const claimed = await prisma.adminActionItem.updateMany({
    where: { id, status: "open" },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedByAdminId: actorAdminId,
      resolutionNote: resolutionNote ?? null,
    },
  });

  if (claimed.count === 0) {
    // Either it never existed, or a concurrent resolve already claimed it
    // — distinguish the two only for a clearer error, not for the claim
    // logic itself (which is already race-safe above).
    const existing = await prisma.adminActionItem.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiHttpError(404, "action_item_not_found", "Admin action item not found");
    }
    throw new ApiHttpError(409, "action_item_already_resolved", "This action item has already been resolved");
  }

  await recordAudit({
    actorAdminId,
    action: "admin_action_item.resolved",
    entityType: "AdminActionItem",
    entityId: id,
    metadata: { resolutionNote: resolutionNote ?? null },
  });

  return getActionItemOrThrow(id);
}
