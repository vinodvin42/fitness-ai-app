import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { createActionItem } from "../../lib/adminActionQueue";
import { ApiHttpError } from "../../middleware/errorHandler";
import { assertHighImpactConfirmed } from "../../lib/highImpactAction";

/**
 * Data-subject requests as a tracked lifecycle — spec §10 "Privacy
 * request": RECEIVED -> VERIFYING -> IN_PROGRESS -> COMPLETED / REJECTED.
 *
 * This is journey F8 ("Privacy: user requests export or deletion ->
 * Admin queue -> done"), which the handoff records as broken because
 * "user cannot see request status; no 'export ready' or 'deletion
 * scheduled' state".
 *
 * The pre-existing `GET /users/me/export` and `DELETE /users/me` still
 * work and are unchanged: an export the user can take away immediately
 * is a better outcome than a ticket, and account deletion behind the
 * user's own password is a legitimate self-service path. What was
 * missing is the *tracked* route — a deletion with a cancellation
 * window, an export whose readiness the user can watch, and an admin
 * queue with a verification step. Both now exist; this one is the one
 * U-M17 renders and A-M5 works.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

/** §10's transitions, as data. Anything absent is refused. */
const ALLOWED: Record<string, readonly string[]> = {
  received: ["verifying", "rejected"],
  verifying: ["in_progress", "rejected"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
};

function assertTransition(from: string, to: string) {
  if (!ALLOWED[from]?.includes(to)) {
    throw new ApiHttpError(
      409,
      "invalid_privacy_request_transition",
      `A privacy request cannot move from ${from} to ${to}`,
    );
  }
}

/**
 * DPDP gives a subject a window to change their mind, and a deletion
 * that runs the instant it is asked for leaves no room for "I was
 * phished" or "that was my child on my phone". 30 days also matches the
 * retention wording the placeholder privacy policy carries.
 */
export const DELETION_GRACE_DAYS = 30;

/** How long a generated export stays downloadable. */
export const EXPORT_LINK_TTL_HOURS = 72;

export async function createPrivacyRequest(
  userId: string,
  input: { type: "export" | "deletion"; userNote?: string | null },
) {
  // One open request per type. A second identical request is not an
  // error from the subject's point of view — they are asking for the
  // same thing — so return the one already in flight rather than
  // creating a duplicate queue item for staff to reconcile.
  const existing = await prisma.privacyRequest.findFirst({
    where: { userId, type: input.type, status: { in: ["received", "verifying", "in_progress"] } },
  });
  if (existing) return existing;

  const created = await prisma.privacyRequest.create({
    data: { userId, type: input.type, userNote: input.userNote ?? null, status: "received" },
  });

  await recordAudit({
    actorId: userId,
    action: "privacy.request_created",
    entityType: "PrivacyRequest",
    entityId: created.id,
    ruleId: "BR-PRV-001",
    stateAfter: { status: "received", type: input.type },
  });

  await trackEvent(
    userId,
    "privacy.request_created",
    { privacyRequestId: created.id },
    { ruleId: "BR-PRV-001", metadata: { type: input.type } },
  );

  // A deletion needs a human decision, an export mostly does not.
  await createActionItem({
    type: "privacy_request",
    entityType: "PrivacyRequest",
    entityId: created.id,
    severity: input.type === "deletion" ? "medium" : "low",
    metadata: { requestType: input.type, userId },
  });

  return created;
}

/** U-M17 — what the user's own "request status" screen reads. */
export async function listMyPrivacyRequests(userId: string) {
  return prisma.privacyRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      completedAt: true,
      scheduledFor: true,
      exportUrl: true,
      exportExpiresAt: true,
      rejectionReason: true,
    },
  });
}

/**
 * The subject cancels their own pending deletion — the whole point of
 * the grace window. Modelled as a rejection with a reason naming the
 * subject, rather than a separate `cancelled` state, because §10's state
 * set has no cancelled and inventing one would put this codebase and the
 * spec out of step for no gain.
 */
export async function cancelMyPrivacyRequest(userId: string, requestId: string) {
  const req = await prisma.privacyRequest.findFirst({ where: { id: requestId, userId } });
  if (!req) throw new ApiHttpError(404, "privacy_request_not_found", "Privacy request not found");
  if (req.status === "completed") {
    throw new ApiHttpError(409, "already_completed", "This request has already been completed");
  }
  if (req.status === "rejected") return req;

  const updated = await prisma.privacyRequest.update({
    where: { id: requestId },
    data: { status: "rejected", rejectionReason: "Cancelled by the user", completedAt: new Date() },
  });

  await recordAudit({
    actorId: userId,
    action: "privacy.request_cancelled",
    entityType: "PrivacyRequest",
    entityId: requestId,
    ruleId: "BR-PRV-001",
    stateBefore: { status: req.status },
    stateAfter: { status: "rejected" },
  });

  return updated;
}

/** A-M5 — the admin queue. */
export async function listPrivacyRequests(filter: { status?: string; type?: string }) {
  return prisma.privacyRequest.findMany({
    where: {
      ...(filter.status ? { status: filter.status as never } : {}),
      ...(filter.type ? { type: filter.type as never } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
}

export async function getPrivacyRequest(requestId: string) {
  const req = await prisma.privacyRequest.findUnique({
    where: { id: requestId },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  if (!req) throw new ApiHttpError(404, "privacy_request_not_found", "Privacy request not found");
  return req;
}

/**
 * A-M5's "verify identity". Separated from fulfilment on purpose: acting
 * on an unverified deletion request is the data breach, not the
 * protection against one.
 */
export async function verifyPrivacyRequest(adminId: string, requestId: string, reason: string) {
  const req = await prisma.privacyRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new ApiHttpError(404, "privacy_request_not_found", "Privacy request not found");
  assertTransition(req.status, "verifying");

  const updated = await prisma.privacyRequest.update({
    where: { id: requestId },
    data: { status: "verifying", verifiedByAdminId: adminId, verifiedAt: new Date() },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "privacy.request_verified",
    entityType: "PrivacyRequest",
    entityId: requestId,
    ruleId: "BR-PRV-001",
    stateBefore: { status: req.status },
    stateAfter: { status: "verifying" },
    metadata: { reason },
  });

  return updated;
}

/**
 * Starts fulfilment. For a deletion this sets the scheduled date, which
 * is the "deletion scheduled" state U-M17 renders; for an export it
 * moves the request into the state whose completion produces a link.
 */
export async function startPrivacyRequest(adminId: string, requestId: string, reason: string) {
  const req = await prisma.privacyRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new ApiHttpError(404, "privacy_request_not_found", "Privacy request not found");
  assertTransition(req.status, "in_progress");

  const scheduledFor =
    req.type === "deletion"
      ? new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)
      : null;

  const updated = await prisma.privacyRequest.update({
    where: { id: requestId },
    data: { status: "in_progress", ...(scheduledFor ? { scheduledFor } : {}) },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "privacy.request_started",
    entityType: "PrivacyRequest",
    entityId: requestId,
    ruleId: "BR-PRV-001",
    stateBefore: { status: req.status },
    stateAfter: { status: "in_progress", scheduledFor },
    metadata: { reason },
  });

  return updated;
}

/**
 * Completes the request. High-impact under BR-ADM-005 — completing a
 * deletion destroys personal data irreversibly, so it takes a written
 * reason and a typed confirmation like any other action of that weight.
 *
 * Acceptance test 17: "A deletion request removes personal data on
 * completion and keeps only records the law requires." The actual delete
 * is delegated to the caller-supplied `performDeletion` so this module
 * does not duplicate `users.service.ts#deleteAccount`'s cascade
 * knowledge; AuditLog survives by its own onDelete: SetNull, which is
 * the "records the law requires" half.
 */
export async function completePrivacyRequest(
  adminId: string,
  requestId: string,
  input: { reason?: string | null; confirmation?: string | null; exportUrl?: string | null },
  performDeletion: (userId: string) => Promise<void>,
) {
  const reason = assertHighImpactConfirmed(input);

  const req = await prisma.privacyRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new ApiHttpError(404, "privacy_request_not_found", "Privacy request not found");
  assertTransition(req.status, "completed");

  if (req.type === "deletion") {
    await performDeletion(req.userId);
  }

  // Re-read rather than reusing `req`: a deletion cascade may have
  // touched this row's owner, and the audit below must describe what is
  // actually true afterwards.
  const stillThere = await prisma.privacyRequest.findUnique({ where: { id: requestId } });

  const updated = stillThere
    ? await prisma.privacyRequest.update({
        where: { id: requestId },
        data: {
          status: "completed",
          completedAt: new Date(),
          resolvedByAdminId: adminId,
          ...(req.type === "export" && input.exportUrl
            ? {
                exportUrl: input.exportUrl,
                exportExpiresAt: new Date(Date.now() + EXPORT_LINK_TTL_HOURS * 60 * 60 * 1000),
              }
            : {}),
        },
      })
    : null;

  await recordAudit({
    actorAdminId: adminId,
    action: "privacy.request_completed",
    entityType: "PrivacyRequest",
    entityId: requestId,
    ruleId: "BR-PRV-001",
    stateBefore: { status: req.status, type: req.type },
    stateAfter: { status: "completed", userRowRemoved: stillThere === null },
    metadata: { reason },
  });

  return updated;
}

export async function rejectPrivacyRequest(
  adminId: string,
  requestId: string,
  input: { reason?: string | null; confirmation?: string | null },
) {
  const reason = assertHighImpactConfirmed(input);

  const req = await prisma.privacyRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new ApiHttpError(404, "privacy_request_not_found", "Privacy request not found");
  assertTransition(req.status, "rejected");

  const updated = await prisma.privacyRequest.update({
    where: { id: requestId },
    data: { status: "rejected", rejectionReason: reason, completedAt: new Date(), resolvedByAdminId: adminId },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "privacy.request_rejected",
    entityType: "PrivacyRequest",
    entityId: requestId,
    ruleId: "BR-PRV-001",
    stateBefore: { status: req.status },
    stateAfter: { status: "rejected" },
    metadata: { reason },
  });

  return updated;
}
