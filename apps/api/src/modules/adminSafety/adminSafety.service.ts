import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { ListSafetyEscalationsQuery } from "./adminSafety.schema";

/**
 * BR-SAF-004 Safety Escalations (R1 Developer 1, 18 Sep 2026) — Module 08
 * Support & Safety's real second queue, alongside 08.02 Escalations
 * (`adminSupport.service.ts`). Closes the real gap §43/§50 both named
 * honestly: `AssessmentSummaryScreen`'s Safety card rendered a user's
 * reported medical conditions/injuries, but nothing escalated that
 * information anywhere a human admin could see it — no `SafetyEscalation`
 * model existed, so there was no honest trigger point for a
 * `safety.escalated` event either.
 *
 * **What this is, and isn't** — same discipline
 * `adminSupport.service.ts`'s own top comment applies to 08.02 vs.
 * 08.03/08.04: this is the smallest real, honest slice of "safety
 * escalation" Developer 1 can actually own. A row is created server-side
 * (`users.service.ts#upsertOnboardingProfile`, see that function's own
 * comment) the moment a user's FIRST real onboarding completion reports
 * any medical condition or injury — never on the assessment retake/partial-
 * edit path, which structurally can't reach medicalConditions/injuries at
 * all (see `editOnboardingProfileSchema`'s own comment). This queue is the
 * first, and only, screen that reads those rows: a list, filterable by
 * reviewed/unreviewed, and one real action — "Mark Reviewed" — which
 * records who looked at it and when. Deliberately NOT built: any
 * automated risk scoring, automated messaging to the user, or blocking
 * their access based on what they reported — a real human reviewing real
 * reported health data is the correct, safe scope here, not an AI-driven
 * medical decision (this work package's own §12 names "medical diagnosis/
 * treatment" as out of scope).
 *
 * Reuses the `support` permission module (`view`/`edit`) — same reasoning
 * `adminSupport.routes.ts` already gives for 08.02 Escalations sharing it:
 * this is Module 08 — Support & Safety's own second real queue, not a new
 * permission scope.
 *
 * Deliberately does NOT import `SafetyEscalation` as a Prisma model type —
 * same "the un-generated `@prisma/client` stub has no real model exports"
 * reasoning every other admin service file in this build follows.
 */

type SafetyEscalationRow = {
  id: string;
  userId: string;
  medicalConditions: string[];
  injuries: string[];
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedByAdminId: string | null;
  user: { id: string; fullName: string; email: string };
  reviewedByAdmin: { fullName: string } | null;
};

const SAFETY_ESCALATION_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  reviewedByAdmin: { select: { fullName: true } },
} as const;

function toListItem(e: SafetyEscalationRow) {
  return {
    id: e.id,
    userId: e.user.id,
    userFullName: e.user.fullName,
    userEmail: e.user.email,
    medicalConditions: e.medicalConditions,
    injuries: e.injuries,
    createdAt: e.createdAt,
    reviewedAt: e.reviewedAt,
    reviewedByAdminId: e.reviewedByAdminId,
    reviewedByAdminName: e.reviewedByAdmin?.fullName ?? null,
  };
}

export async function listSafetyEscalations(query: ListSafetyEscalationsQuery) {
  const rows = (await prisma.safetyEscalation.findMany({
    include: SAFETY_ESCALATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  })) as SafetyEscalationRow[];

  // Counts reflect the full set, computed before the reviewed/unreviewed
  // filter below narrows it — same "stable superset of the filtered list"
  // convention as adminSupport.service.ts's listEscalations/
  // listSupportTickets.
  const counts = {
    total: rows.length,
    unreviewed: rows.filter((r) => !r.reviewedAt).length,
    reviewed: rows.filter((r) => !!r.reviewedAt).length,
  };

  const filtered =
    query.reviewed === "true"
      ? rows.filter((r) => !!r.reviewedAt)
      : query.reviewed === "false"
        ? rows.filter((r) => !r.reviewedAt)
        : rows;

  return { escalations: filtered.map(toListItem), counts };
}

async function getSafetyEscalationOrThrow(id: string): Promise<SafetyEscalationRow> {
  const escalation = await prisma.safetyEscalation.findUnique({ where: { id }, include: SAFETY_ESCALATION_INCLUDE });
  if (!escalation) {
    throw new ApiHttpError(404, "not_found", "Safety escalation not found");
  }
  return escalation as SafetyEscalationRow;
}

export async function reviewSafetyEscalation(actorAdminId: string, id: string) {
  const escalation = await getSafetyEscalationOrThrow(id);
  if (escalation.reviewedAt) {
    throw new ApiHttpError(409, "already_reviewed", "This safety escalation has already been reviewed");
  }

  await prisma.safetyEscalation.update({
    where: { id },
    data: { reviewedAt: new Date(), reviewedByAdminId: actorAdminId },
  });

  await recordAudit({
    actorAdminId,
    action: "admin.safetyEscalation.reviewed",
    entityType: "SafetyEscalation",
    entityId: id,
    metadata: { userId: escalation.userId },
  });

  return toListItem(await getSafetyEscalationOrThrow(id));
}
