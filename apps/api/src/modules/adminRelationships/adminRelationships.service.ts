import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { EndRelationshipInput, ListChangeRequestsQuery, ListRelationshipsQuery, ReviewChangeRequestInput } from "./adminRelationships.schema";
import type { HandoverRelationshipInput } from "../relationshipLifecycle/relationshipLifecycle.schema";
import * as relationshipLifecycleService from "../relationshipLifecycle/relationshipLifecycle.service";

/**
 * Module 04 — Relationships (docs/admin/03-screen-inventory.md §04), added
 * 21 Aug 2026. Directory (04.01) and Detail (04.02) are real, queried
 * against the `Relationship` model that's existed since Phase 5 (20 Aug
 * 2026).
 *
 * **25 Aug 2026 update:** the Discovery & Booking product/design conflict
 * (docs/coach/07-open-questions-gaps.md gap §1) was resolved and the
 * `coaching` module shipped — confirming a booking in apps/user-mobile now
 * really does upsert a `Relationship` row (see coaching.service.ts's
 * `ensureRelationship`), so both screens below are no longer guaranteed to
 * render empty; they'll show real rows as real bookings come in.
 *
 * **Same day: 04.03 Change/Intervention Queue is real too.** The
 * `RelationshipChangeRequest` entity already existed (created by
 * apps/user-mobile's Change Professional screen via `POST
 * /coaching/relationships/:id/change-request`) — what was missing was the
 * admin review screen itself, built here now: `listChangeRequests` /
 * `approveChangeRequest` / `denyChangeRequest`.
 *
 * **What Approve actually does, and why:** the Figma spec's "Requested
 * (new professional)" column has no backing field — `createChangeRequest`
 * (coaching.service.ts) never captured which replacement professional the
 * user had in mind, only a reason category + optional note. That means
 * this build cannot literally "reassign" a relationship to a specific new
 * professional the way the spec's column implies; there is no picker
 * anywhere to name one. The one real, well-defined effect available is
 * ending the flagged pairing — the same `endRelationship` action 04.02
 * already ships — which is exactly what `approveChangeRequest` does:
 * treating "Approve" as authorizing the intervention (end the current
 * pairing) rather than fabricating a reassignment this schema can't
 * express. The user picks their actual replacement afterward through
 * apps/user-mobile's real Discovery/Booking flow, same as any other
 * booking in this build. `denyChangeRequest` leaves the relationship
 * untouched. Neither needs a self-review guard like
 * SensitiveDataAccessRequest's `cannot_approve_own_request` — the
 * requester here is always a consumer `User`, never an `AdminUser`.
 *
 * **What's real vs. honestly not modeled**, against the Figma's fuller
 * spec:
 * - 04.01 Directory columns: User/Professional/Service/Status/Start are
 *   real, with real serviceType/status/search/date-range filters.
 *   Pricing/Sessions/Payments have NO backing field anywhere in *this*
 *   endpoint — a `Booking` entity now exists (25 Aug 2026, see the
 *   `coaching` module) and does carry price/session data, but this
 *   directory query doesn't join it yet; that's a genuine follow-up, not
 *   an infra blocker like it was before. The spec'd "Country" filter still
 *   has no backing field — `User` has no country/region column.
 * - 04.02 Detail's "Overview" tab is real: service/status/start/ended
 *   dates, plus the one real state-changing action, End Relationship
 *   (`endRelationship` below), and its reverse, Reactivate. Its "History"
 *   tab is deliberately NOT the Figma's session/payment history (that
 *   would now read from `Booking`, which exists but isn't joined into
 *   this endpoint yet — same follow-up as the Directory's Pricing/Sessions
 *   columns above) — it's the `AuditLog` trail of admin actions taken on
 *   *this* relationship, labeled as such on the frontend so it isn't
 *   mistaken for a real session log. This is the first place in the whole
 *   build that reads `AuditLog` back out for display rather than only ever
 *   writing to it.
 * - 04.03 Change/Intervention Queue: User/Current Professional/Reason/
 *   Submitted/Status are all real. "Requested (new professional)" has no
 *   backing field at all — see the paragraph above — surfaced via
 *   `notAvailable` rather than faked. The spec's "policy note box" (a
 *   static explainer of the intervention rule set) is UI copy, not data;
 *   left to the frontend to write once, not modeled here.
 *
 * Deliberately does NOT import `Relationship`/`AuditLog`/
 * `RelationshipChangeRequest` as Prisma model types — same reasoning as
 * adminProfessionals.service.ts's own comment (the un-generated
 * `@prisma/client` stub has no real model exports).
 */

type RelationshipRow = {
  id: string;
  serviceType: string;
  status: string;
  createdAt: Date;
  endedAt: Date | null;
  user: { id: string; fullName: string; email: string };
  professional: { id: string; fullName: string; email: string };
};

function toListItem(r: RelationshipRow) {
  return {
    id: r.id,
    userId: r.user.id,
    userFullName: r.user.fullName,
    userEmail: r.user.email,
    professionalId: r.professional.id,
    professionalFullName: r.professional.fullName,
    professionalEmail: r.professional.email,
    serviceType: r.serviceType,
    status: r.status,
    createdAt: r.createdAt,
    endedAt: r.endedAt,
  };
}

export async function listRelationships(query: ListRelationshipsQuery) {
  const where: Record<string, unknown> = {};
  if (query.serviceType) where.serviceType = query.serviceType;
  if (query.status) where.status = query.status;
  if (query.startDate || query.endDate) {
    where.createdAt = {
      ...(query.startDate ? { gte: query.startDate } : {}),
      ...(query.endDate ? { lte: query.endDate } : {}),
    };
  }
  if (query.search) {
    where.OR = [
      { user: { fullName: { contains: query.search, mode: "insensitive" } } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
      { professional: { fullName: { contains: query.search, mode: "insensitive" } } },
      { professional: { email: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const relationships = await prisma.relationship.findMany({
    where,
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      professional: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    relationships: (relationships as RelationshipRow[]).map(toListItem),
    total: (relationships as RelationshipRow[]).length,
    // Figma-spec'd 04.01 columns/filters with no backing field — see this
    // file's top comment.
    notAvailable: ["pricing", "sessions", "payments", "country"],
  };
}

async function getRelationshipOrThrow(id: string): Promise<RelationshipRow> {
  const relationship = await prisma.relationship.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      professional: { select: { id: true, fullName: true, email: true } },
    },
  });
  if (!relationship) {
    throw new ApiHttpError(404, "not_found", "Relationship not found");
  }
  return relationship as RelationshipRow;
}

export async function getRelationshipDetail(id: string) {
  const relationship = await getRelationshipOrThrow(id);

  const historyRows = await prisma.auditLog.findMany({
    where: { entityType: "Relationship", entityId: id },
    orderBy: { createdAt: "desc" },
  });

  return {
    relationship: toListItem(relationship),
    // The admin-action audit trail for this relationship — see this file's
    // top comment for why this is deliberately NOT the Figma's
    // session/payment history.
    history: (
      historyRows as Array<{
        id: string;
        action: string;
        actorAdminId: string | null;
        metadata: unknown;
        createdAt: Date;
      }>
    ).map((h) => ({
      id: h.id,
      action: h.action,
      actorAdminId: h.actorAdminId,
      metadata: (h.metadata as Record<string, unknown> | null) ?? null,
      createdAt: h.createdAt,
    })),
    // 04.02 Overview's Pricing/Sessions/Payments — see this file's top
    // comment. "History" isn't listed here since the tab itself is real,
    // just narrower in meaning than the Figma spec envisioned.
    notAvailable: ["pricing", "sessions", "payments"],
  };
}

/**
 * **Wave 3 (20 Sep 2026):** now a thin wrapper over the real, shared
 * `relationshipLifecycle.service.ts#endRelationship` — the same function
 * apps/coach-mobile's new professional-initiated End Relationship action
 * calls — rather than a second, independent state-transition
 * implementation. This preserves the existing route/response shape
 * (`AdminRelationshipListItem`, decorated with user/professional identity)
 * for its existing admin-web caller; the actual `status`/`endedAt`/
 * `endReason` mutation and the `recordAudit` write now happen once, in the
 * shared module.
 */
export async function endRelationship(adminId: string, id: string, input: EndRelationshipInput) {
  await relationshipLifecycleService.endRelationship({ adminId }, id, input.reason);
  const relationship = await getRelationshipOrThrow(id);
  return toListItem(relationship);
}

/**
 * The admin-initiated real "Handover to Another Coach" action — the exact
 * same `relationshipLifecycle.service.ts#handoverRelationship` composing
 * `endRelationship` + `professionalOffers.service.ts#createOffer` that
 * apps/coach-mobile's professional-initiated Handover action uses, just
 * with an admin actor. See that module's own top comment for the full
 * "why a new ProfessionalOffer, not a second transfer model" reasoning.
 */
export async function handoverRelationship(adminId: string, id: string, input: HandoverRelationshipInput) {
  const result = await relationshipLifecycleService.handoverRelationship(
    { adminId },
    id,
    input.reason,
    input.replacementProfessionalId,
  );
  const relationship = await getRelationshipOrThrow(id);
  return { relationship: toListItem(relationship), offer: result.offer };
}

export async function reactivateRelationship(adminId: string, id: string) {
  const relationship = await getRelationshipOrThrow(id);

  if (relationship.status === "active") {
    throw new ApiHttpError(409, "relationship_already_active", "This relationship is already active");
  }

  const updated = await prisma.relationship.update({
    where: { id },
    data: { status: "active", endedAt: null },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.relationship.reactivated",
    entityType: "Relationship",
    entityId: id,
  });

  return toListItem({
    id: updated.id,
    serviceType: updated.serviceType,
    status: updated.status,
    createdAt: updated.createdAt,
    endedAt: updated.endedAt,
    user: relationship.user,
    professional: relationship.professional,
  });
}

// ---- 04.03 Change/Intervention Queue (added 25 Aug 2026) ------------------

type ChangeRequestRow = {
  id: string;
  relationshipId: string;
  reason: string;
  note: string | null;
  status: string;
  reviewedByAdminId: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
  user: { id: string; fullName: string; email: string };
  relationship: {
    serviceType: string;
    professional: { id: string; fullName: string; email: string };
  };
};

const CHANGE_REQUEST_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  relationship: { select: { serviceType: true, professional: { select: { id: true, fullName: true, email: true } } } },
} as const;

function toChangeRequestItem(r: ChangeRequestRow) {
  return {
    id: r.id,
    relationshipId: r.relationshipId,
    userId: r.user.id,
    userFullName: r.user.fullName,
    userEmail: r.user.email,
    currentProfessionalId: r.relationship.professional.id,
    currentProfessionalFullName: r.relationship.professional.fullName,
    currentProfessionalEmail: r.relationship.professional.email,
    serviceType: r.relationship.serviceType,
    reason: r.reason,
    note: r.note,
    status: r.status,
    reviewedByAdminId: r.reviewedByAdminId,
    reviewedAt: r.reviewedAt,
    reviewNotes: r.reviewNotes,
    createdAt: r.createdAt,
  };
}

export async function listChangeRequests(query: ListChangeRequestsQuery) {
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;

  const requests = await prisma.relationshipChangeRequest.findMany({
    where,
    include: CHANGE_REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return {
    requests: (requests as ChangeRequestRow[]).map(toChangeRequestItem),
    total: (requests as ChangeRequestRow[]).length,
    // The Figma's "Requested (new professional)" column — see this file's
    // top comment for why no code path anywhere captures which
    // replacement professional a user had in mind.
    notAvailable: ["requestedProfessional"],
  };
}

async function getChangeRequestOrThrow(id: string): Promise<ChangeRequestRow> {
  const request = await prisma.relationshipChangeRequest.findUnique({
    where: { id },
    include: CHANGE_REQUEST_INCLUDE,
  });
  if (!request) {
    throw new ApiHttpError(404, "not_found", "Change request not found");
  }
  return request as ChangeRequestRow;
}

/**
 * Approving is the real intervention: it ends the flagged pairing (if
 * still active) via the same `endRelationship` this module already
 * ships, then marks the request `approved`. See this file's top comment
 * for why ending the pairing — not a literal reassignment — is the one
 * well-defined effect this schema supports. If the pairing was already
 * ended by some other path (e.g. an admin used End Relationship directly
 * first) this doesn't error — the request still moves to `approved`,
 * since the underlying intervention it asked for is already satisfied.
 */
export async function approveChangeRequest(adminId: string, id: string, input: ReviewChangeRequestInput) {
  const request = await getChangeRequestOrThrow(id);
  if (request.status !== "pending") {
    throw new ApiHttpError(409, "change_request_already_reviewed", `This request has already been ${request.status}`);
  }

  const relationship = await prisma.relationship.findUnique({ where: { id: request.relationshipId } });
  const rel = relationship as { status: string } | null;
  if (rel?.status === "active") {
    await endRelationship(adminId, request.relationshipId, {
      reason: `Change request approved (${request.reason})${input.reviewNotes ? `: ${input.reviewNotes}` : ""}`,
    });
  }

  const updated = await prisma.relationshipChangeRequest.update({
    where: { id },
    data: { status: "approved", reviewedByAdminId: adminId, reviewedAt: new Date(), reviewNotes: input.reviewNotes ?? null },
    include: CHANGE_REQUEST_INCLUDE,
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.relationship_change_request.approve",
    entityType: "RelationshipChangeRequest",
    entityId: id,
    metadata: { relationshipId: request.relationshipId, userId: request.user.id },
  });

  return { request: toChangeRequestItem(updated as ChangeRequestRow) };
}

/** Denying leaves the relationship untouched — just records the decision. Status becomes `rejected` (the schema's enum value), even though the endpoint/UI say "Deny" to match the Figma's own wording. */
export async function denyChangeRequest(adminId: string, id: string, input: ReviewChangeRequestInput) {
  const request = await getChangeRequestOrThrow(id);
  if (request.status !== "pending") {
    throw new ApiHttpError(409, "change_request_already_reviewed", `This request has already been ${request.status}`);
  }

  const updated = await prisma.relationshipChangeRequest.update({
    where: { id },
    data: { status: "rejected", reviewedByAdminId: adminId, reviewedAt: new Date(), reviewNotes: input.reviewNotes ?? null },
    include: CHANGE_REQUEST_INCLUDE,
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.relationship_change_request.deny",
    entityType: "RelationshipChangeRequest",
    entityId: id,
    metadata: { relationshipId: request.relationshipId, userId: request.user.id },
  });

  return { request: toChangeRequestItem(updated as ChangeRequestRow) };
}
