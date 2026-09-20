import { ProfessionalLifecycleStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { UpdateMaxActiveClientsInput } from "./professionalLifecycle.schema";

/**
 * R2 Wave 1 (20 Sep 2026) — Developer 2's real R1 work package §2 names the
 * full account-level Professional lifecycle:
 * `APPLICATION -> VERIFICATION -> APPROVED -> AVAILABLE -> OFFERED/ASSIGNED
 * -> ... -> COMPLETED/CHANGED/ENDED`. This module owns only the first four
 * stages — the professional's own account, before any specific client
 * relationship exists. Everything from OFFERED onward is about a specific
 * `Relationship` row (already real, coaching.service.ts's own scope) and is
 * a later wave's work, not touched here.
 *
 * Lives in its own module rather than inside `professionalOnboarding` or
 * `adminProfessionals` because its transitions are triggered from BOTH —
 * `professionalOnboarding.service.ts#submitCredential` (system-driven
 * `application -> verification`) and `adminProfessionals.service.ts`'s
 * `verifyCredential`/`verifyKyc`/`suspendProfessional`/
 * `reactivateProfessional` (the remaining three transitions) — putting it
 * in either of those two would mean the other importing across module
 * boundaries for the opposite direction. Both real modules import from
 * here; this module imports from neither.
 *
 * **Additive, not a replacement.** `Professional.lifecycleStatus` sits
 * alongside the pre-existing `Professional.status` (active/suspended) and
 * `ProfessionalCredential.status` (not_verified/pending/verified/rejected,
 * per-service — genuinely solid, untouched by this wave) — see
 * `ProfessionalLifecycleStatus`'s own doc comment in schema.prisma for the
 * exact, documented interaction between all three fields.
 *
 * **The `available` gate.** `available` is reachable ONLY when the
 * professional holds at least one `verified` `ProfessionalCredential` — see
 * `meetsAvailablePrecondition` below. This is the one real, enforced link
 * between the new lifecycle and the existing credential system: nothing in
 * this module can push `lifecycleStatus` to `available` for a professional
 * with zero verified services. Gym affiliation (a separate, parallel Wave 1
 * unit, not present in this schema) never grants any stage here — see
 * BR-PRO-003.
 */

const LIFECYCLE_STATUSES: ProfessionalLifecycleStatus[] = [
  "application",
  "verification",
  "approved",
  "available",
  "suspended",
];

function isLifecycleStatus(value: unknown): value is ProfessionalLifecycleStatus {
  return typeof value === "string" && (LIFECYCLE_STATUSES as string[]).includes(value);
}

async function getProfessionalWithCredentialsOrThrow(professionalId: string) {
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    include: { credentials: { select: { status: true } } },
  });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }
  return professional;
}

/** The real, enforced precondition for `available` — see this file's top comment. */
function meetsAvailablePrecondition(professional: { credentials: Array<{ status: string }> }): boolean {
  return professional.credentials.some((c) => c.status === "verified");
}

/**
 * Best-effort reconstruction of the correct stage from real, current
 * signals, used only when no better record exists (the migration's initial
 * backfill, and `restoreLifecycleAfterReactivation`'s fallback when no
 * matching suspend audit entry is found). Cannot recover a genuine
 * `approved` admin decision that isn't ALSO evidenced by a verified
 * credential (approval is a judgment call, not purely derivable from data)
 * — so this intentionally collapses "approved-but-not-yet-available" into
 * "available" whenever the precondition already holds, which is the same
 * real state a fresh `approved -> available` recompute would reach anyway.
 */
function recomputeFallbackStage(professional: {
  kycStatus: string;
  credentials: Array<{ status: string }>;
}): ProfessionalLifecycleStatus {
  const hasAnyCredential = professional.credentials.length > 0;
  const hasVerifiedCredential = meetsAvailablePrecondition(professional);

  if (hasVerifiedCredential) return "available";
  if (hasAnyCredential || professional.kycStatus !== "not_verified") return "verification";
  return "application";
}

/**
 * System-driven `application -> verification`. Call the moment a
 * professional submits their first credential (professionalOnboarding.
 * service.ts#submitCredential) — a no-op for a professional already past
 * `application` (e.g. re-submitting a rejected credential).
 */
export async function transitionToVerification(professionalId: string) {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }
  if (professional.lifecycleStatus !== "application") {
    return professional;
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { lifecycleStatus: "verification" },
  });

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "professional.lifecycle.verification",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { trigger: "first_credential_submitted" },
  });

  return updated;
}

/**
 * Admin-driven `verification -> approved`, once BOTH the shared KYC check
 * and at least one service credential have cleared — call from
 * `adminProfessionals.service.ts`'s `verifyCredential`/`verifyKyc` after
 * their own status update lands (real call in, not a parallel disconnected
 * function). A no-op unless the professional is currently at `verification`
 * and both conditions hold; safe to call opportunistically after every
 * verify/reject action.
 */
export async function maybeAdvanceToApproved(adminId: string, professionalId: string) {
  const professional = await getProfessionalWithCredentialsOrThrow(professionalId);
  if (professional.lifecycleStatus !== "verification") {
    return professional;
  }

  const kycCleared = professional.kycStatus === "verified";
  const hasVerifiedCredential = meetsAvailablePrecondition(professional);
  if (!kycCleared || !hasVerifiedCredential) {
    return professional;
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { lifecycleStatus: "approved" },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "professional.lifecycle.approved",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { reason: "kyc_and_credential_cleared" },
  });

  return updated;
}

/**
 * System-driven `approved <-> available`, purely a function of
 * `meetsAvailablePrecondition` — the ONE gate for `available`, so this is
 * the single authoritative place that boundary moves in either direction
 * (a credential being rejected after it was the professional's only
 * verified one demotes `available` back to `approved`; a newly-verified
 * credential promotes `approved` to `available`). Never touches
 * `application`/`verification`/`suspended` — call opportunistically after
 * any event that could change the professional's verified-credential
 * count (credential verify/reject, and after `maybeAdvanceToApproved`).
 * `actorAdminId` is optional — omit it for a purely system-triggered
 * recompute (e.g. right after reactivation).
 */
export async function recomputeAvailability(professionalId: string, actorAdminId?: string) {
  const professional = await getProfessionalWithCredentialsOrThrow(professionalId);
  if (professional.lifecycleStatus !== "approved" && professional.lifecycleStatus !== "available") {
    return professional;
  }

  const nextStatus: ProfessionalLifecycleStatus = meetsAvailablePrecondition(professional)
    ? "available"
    : "approved";
  if (nextStatus === professional.lifecycleStatus) {
    return professional;
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { lifecycleStatus: nextStatus },
  });

  await recordAudit({
    actorAdminId: actorAdminId ?? null,
    action: nextStatus === "available" ? "professional.lifecycle.available" : "professional.lifecycle.demoted_to_approved",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { from: professional.lifecycleStatus, to: nextStatus },
  });

  return updated;
}

/**
 * Admin-driven `-> suspended`. Called from `adminProfessionals.service.ts`'s
 * `suspendProfessional`, alongside (not instead of) that function's own
 * `Professional.status = "suspended"` write. Snapshots the pre-suspension
 * `lifecycleStatus` into this same audit entry's metadata so
 * `restoreLifecycleAfterReactivation` can put it back — see this module's
 * top comment on why that's stored in AuditLog rather than a dedicated
 * column. Idempotent: a professional whose `lifecycleStatus` is already
 * `suspended` is left alone (no redundant audit entry).
 */
export async function suspendLifecycle(adminId: string, professionalId: string) {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }
  if (professional.lifecycleStatus === "suspended") {
    return professional;
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { lifecycleStatus: "suspended" },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "professional.lifecycle.suspended",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { previousLifecycleStatus: professional.lifecycleStatus },
  });

  return updated;
}

/**
 * Admin-driven restore on `reactivateProfessional`. Looks up this
 * professional's most recent `professional.lifecycle.suspended` audit
 * entry and restores the `previousLifecycleStatus` it snapshotted; falls
 * back to `recomputeFallbackStage` (real current signals, not a fabricated
 * guess) when no such entry exists — e.g. an account suspended before this
 * wave shipped `suspendLifecycle`. A no-op if `lifecycleStatus` isn't
 * currently `suspended`. Finishes with an opportunistic
 * `recomputeAvailability` pass in case credential state changed while
 * suspended (e.g. a credential expired or was rejected mid-suspension).
 */
export async function restoreLifecycleAfterReactivation(adminId: string, professionalId: string) {
  const professional = await getProfessionalWithCredentialsOrThrow(professionalId);
  if (professional.lifecycleStatus !== "suspended") {
    return professional;
  }

  const lastSuspendEntry = await prisma.auditLog.findFirst({
    where: { entityType: "Professional", entityId: professionalId, action: "professional.lifecycle.suspended" },
    orderBy: { createdAt: "desc" },
  });

  const metadata = lastSuspendEntry?.metadata as { previousLifecycleStatus?: string } | null;
  const snapshotted = metadata?.previousLifecycleStatus;
  const restoredStatus: ProfessionalLifecycleStatus =
    snapshotted && snapshotted !== "suspended" && isLifecycleStatus(snapshotted)
      ? snapshotted
      : recomputeFallbackStage(professional);

  await prisma.professional.update({
    where: { id: professionalId },
    data: { lifecycleStatus: restoredStatus },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "professional.lifecycle.restored",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { restoredTo: restoredStatus, source: snapshotted ? "audit_snapshot" : "fallback_recompute" },
  });

  return recomputeAvailability(professionalId, adminId);
}

/**
 * Professional- or admin-editable capacity (docs' §4 "Availability
 * toggle"). `actor` attributes the AuditLog entry to whichever identity
 * made the call — pass exactly one.
 */
export async function updateMaxActiveClients(
  professionalId: string,
  input: UpdateMaxActiveClientsInput,
  actor: { professionalId?: string; adminId?: string },
) {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { maxActiveClients: input.maxActiveClients },
  });

  await recordAudit({
    actorProfessionalId: actor.professionalId ?? null,
    actorAdminId: actor.adminId ?? null,
    action: "professional.max_active_clients_updated",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { from: professional.maxActiveClients, to: input.maxActiveClients },
  });

  return updated;
}

/**
 * Computed "is this professional currently available for a new client" —
 * a service function other modules can call later (the OFFERED/ASSIGNED
 * offer flow this wave explicitly doesn't build, per its "Explicit out of
 * scope" section, will be the first real caller). `activeRelationshipCount
 * < maxActiveClients AND lifecycleStatus === "available"` per the product
 * decision — also fails closed for a suspended professional even if
 * `lifecycleStatus` somehow still reads `available` (shouldn't happen via
 * this module's own functions, but `status` is always the authoritative
 * "can this professional do anything" gate — see schema.prisma's own
 * comment on the two enums' interaction).
 */
export async function isAvailableForNewClients(professionalId: string): Promise<boolean> {
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { status: true, lifecycleStatus: true, maxActiveClients: true },
  });
  if (!professional) return false;
  if (professional.status === "suspended") return false;
  if (professional.lifecycleStatus !== "available") return false;

  const activeRelationshipCount = await prisma.relationship.count({
    where: { professionalId, status: "active" },
  });

  return activeRelationshipCount < professional.maxActiveClients;
}

/** Read-only summary for GET /professionals/me/lifecycle. */
export async function getLifecycleSummary(professionalId: string) {
  const professional = await prisma.professional.findUnique({
    where: { id: professionalId },
    select: { lifecycleStatus: true, maxActiveClients: true, status: true },
  });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }

  const [activeRelationshipCount, available] = await Promise.all([
    prisma.relationship.count({ where: { professionalId, status: "active" } }),
    isAvailableForNewClients(professionalId),
  ]);

  return {
    lifecycleStatus: professional.lifecycleStatus,
    status: professional.status,
    maxActiveClients: professional.maxActiveClients,
    activeClients: activeRelationshipCount,
    isAvailableForNewClients: available,
  };
}
