import { prisma } from "../../db/prisma";
import { r1Flags } from "@fitness-ai-app/config";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { createActionItem, resolveActionItemsFor } from "../../lib/adminActionQueue";
import { createNotification } from "../notifications/notifications.service";
import { ApiHttpError } from "../../middleware/errorHandler";

/**
 * "Request professional guidance" — the controlled-assignment entry
 * point locked by handoff §2 decision #4, and the missing half of
 * journey F5 ("Nothing turns a request into an offer").
 *
 * The user asks for help without naming anyone; an admin matches it
 * (A-M1) and sends an offer; the professional accepts and the existing
 * offer -> relationship machinery takes over unchanged. D1's build-to
 * default is `admin_assigns`, which `r1Flags.OFFER_MATCHING_MODE`
 * carries, so switching to auto-match later is a config change.
 *
 * Deliberately does NOT import Prisma model types — see apps/api/README.md.
 */

export async function createGuidanceRequest(
  userId: string,
  input: { serviceType: "fitness" | "nutrition"; userNote?: string | null; coachGender?: "male" | "female" | null },
) {
  // §10's relationship limit: "A user has at most one active Fitness and
  // one active Nutrition professional." A second open request for a
  // service the user already has covered would produce an offer that
  // could never be accepted.
  const activeForService = await prisma.relationship.findFirst({
    where: { userId, serviceType: input.serviceType, status: "active" },
  });
  if (activeForService) {
    throw new ApiHttpError(
      409,
      "already_has_professional",
      `You already have an active ${input.serviceType} professional`,
    );
  }

  const open = await prisma.guidanceRequest.findFirst({
    where: { userId, serviceType: input.serviceType, status: { in: ["open", "offered"] } },
  });
  if (open) return open;

  const created = await prisma.guidanceRequest.create({
    data: {
      userId,
      serviceType: input.serviceType,
      userNote: input.userNote ?? null,
      coachGenderPreference: input.coachGender ?? null,
    },
  });

  await trackEvent(
    userId,
    "professional.requested",
    { guidanceRequestId: created.id },
    { ruleId: "BR-PRO-014", metadata: { serviceType: input.serviceType, mode: r1Flags.OFFER_MATCHING_MODE } },
  );

  await recordAudit({
    actorId: userId,
    action: "guidance_request.created",
    entityType: "GuidanceRequest",
    entityId: created.id,
    ruleId: "BR-PRO-014",
    stateAfter: { status: "open", serviceType: input.serviceType },
  });

  // A-M1's queue is an admin action queue item, so an unmatched request
  // surfaces on Action Required rather than waiting to be noticed.
  await createActionItem({
    type: "professional_assignment_pending",
    entityType: "GuidanceRequest",
    entityId: created.id,
    severity: "medium",
    metadata: { userId, serviceType: input.serviceType },
  });

  return created;
}

/** U-M5 — "Professional request submitted / finding a professional". */
export async function listMyGuidanceRequests(userId: string) {
  return prisma.guidanceRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function cancelMyGuidanceRequest(userId: string, id: string) {
  const req = await prisma.guidanceRequest.findFirst({ where: { id, userId } });
  if (!req) throw new ApiHttpError(404, "guidance_request_not_found", "Request not found");
  if (req.status === "fulfilled") {
    throw new ApiHttpError(409, "already_fulfilled", "This request already has a professional");
  }

  const updated = await prisma.guidanceRequest.update({
    where: { id },
    data: { status: "cancelled", resolvedAt: new Date(), closedReason: "Cancelled by the user" },
  });
  await recordAudit({
    actorId: userId,
    action: "guidance_request.cancelled",
    entityType: "GuidanceRequest",
    entityId: id,
    ruleId: "BR-PRO-014",
    stateBefore: { status: req.status },
    stateAfter: { status: "cancelled" },
  });
  await resolveActionItemsFor("GuidanceRequest", id, null, "Cancelled by the member");
  return updated;
}

/** A-M1's queue: open user requests, oldest first. */
export async function listOpenGuidanceRequests(status?: string) {
  return prisma.guidanceRequest.findMany({
    where: { status: (status ?? "open") as never },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
}

/** Marks a request as having an offer out. Called when an admin matches it. */
export async function markOffered(requestId: string, offerId: string, adminId: string) {
  const req = await prisma.guidanceRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new ApiHttpError(404, "guidance_request_not_found", "Request not found");
  if (req.status !== "open") {
    throw new ApiHttpError(409, "request_not_open", `A ${req.status} request cannot be matched`);
  }

  const updated = await prisma.guidanceRequest.update({
    where: { id: requestId },
    data: { status: "offered", offerId },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "guidance_request.matched",
    entityType: "GuidanceRequest",
    entityId: requestId,
    ruleId: "BR-PRO-014",
    stateBefore: { status: "open" },
    stateAfter: { status: "offered", offerId },
  });
  // Matching was the queue item's job (27 Oct 2026). If the offer comes back
  // declined or expired, returnToQueue queues the request again.
  await resolveActionItemsFor("GuidanceRequest", requestId, adminId, "Matched with a professional");

  return updated;
}

/**
 * The offer came back declined or expired. D11: three re-matches, then
 * the request stops auto-returning to the queue and is marked
 * `exhausted` so a human decides rather than the system looping.
 *
 * U-M7 ("No professional available / request declined -> re-match") is
 * the screen that renders both outcomes.
 */
export async function returnToQueue(requestId: string, cause: "declined" | "expired") {
  const req = await prisma.guidanceRequest.findUnique({ where: { id: requestId } });
  if (!req) return null;

  const nextCount = req.rematchCount + 1;
  const exhausted = nextCount >= r1Flags.MAX_REMATCH_ATTEMPTS;

  const updated = await prisma.guidanceRequest.update({
    where: { id: requestId },
    data: {
      status: exhausted ? "exhausted" : "open",
      rematchCount: nextCount,
      offerId: null,
      ...(exhausted
        ? {
            closedReason: `No professional accepted after ${nextCount} attempts`,
            resolvedAt: new Date(),
          }
        : {}),
    },
  });

  await recordAudit({
    action: exhausted ? "guidance_request.exhausted" : "guidance_request.returned_to_queue",
    entityType: "GuidanceRequest",
    entityId: requestId,
    ruleId: "BR-PRO-014",
    stateBefore: { status: "offered", rematchCount: req.rematchCount },
    stateAfter: { status: updated.status, rematchCount: nextCount },
    metadata: { cause },
  });

  if (exhausted) {
    await createActionItem({
      type: "professional_assignment_pending",
      entityType: "GuidanceRequest",
      entityId: requestId,
      severity: "high",
      metadata: { userId: req.userId, serviceType: req.serviceType, reason: "rematch_limit_reached" },
    });
    // The member hears that no match was found (27 Oct 2026); before this the
    // request just sat at "finding a professional" from their side.
    await createNotification(req.userId, {
      kind: "coach",
      title: "We couldn't find you a coach this time",
      body: `Fynrox couldn't find a ${req.serviceType} coach who could take you on right now, so your request has closed. You can browse coaches and ask one directly, or send a new request later.`,
      deepLink: "coaching",
    });
  } else {
    // Back in A-M1's queue: it needs a queue item again (the match resolved
    // the first one). At most one open item per request.
    const open = await prisma.adminActionItem
      .findFirst({ where: { entityType: "GuidanceRequest", entityId: requestId, status: "open" }, select: { id: true } })
      .catch(() => null);
    if (!open) {
      await createActionItem({
        type: "professional_assignment_pending",
        entityType: "GuidanceRequest",
        entityId: requestId,
        severity: "medium",
        metadata: { userId: req.userId, serviceType: req.serviceType, reason: `offer_${cause}` },
      }).catch(() => undefined);
    }
  }

  return updated;
}

/** The professional accepted — the request's job is done. */
export async function markFulfilled(requestId: string, relationshipId: string) {
  const req = await prisma.guidanceRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status === "fulfilled") return req;

  const updated = await prisma.guidanceRequest.update({
    where: { id: requestId },
    data: { status: "fulfilled", resolvedAt: new Date() },
  });

  await recordAudit({
    action: "guidance_request.fulfilled",
    entityType: "GuidanceRequest",
    entityId: requestId,
    ruleId: "BR-PRO-014",
    stateBefore: { status: req.status },
    stateAfter: { status: "fulfilled", relationshipId },
  });
  await resolveActionItemsFor("GuidanceRequest", requestId, null, "A professional accepted the offer");

  return updated;
}

/**
 * Read for the match action — refuses anything not actually matchable,
 * so the route cannot create an offer against a cancelled or already
 * fulfilled request.
 */
export async function getGuidanceRequestForMatch(id: string) {
  const req = await prisma.guidanceRequest.findUnique({ where: { id } });
  if (!req) throw new ApiHttpError(404, "guidance_request_not_found", "Request not found");
  if (req.status !== "open") {
    throw new ApiHttpError(409, "request_not_open", `A ${req.status} request cannot be matched`);
  }
  return req;
}
