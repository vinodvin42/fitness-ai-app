import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createActionItem } from "../../lib/adminActionQueue";
import * as professionalLifecycleService from "../professionalLifecycle/professionalLifecycle.service";
import {
  AdminUpdateMaxActiveClientsInput,
  ListProfessionalsQuery,
  SuspendProfessionalInput,
  VerifyCredentialInput,
  VerifyKycInput,
} from "./adminProfessionals.schema";

/**
 * Module 03 — Professionals (docs/admin/03-screen-inventory.md §03), added
 * 21 Aug 2026 — the first admin screen that can actually move a
 * `ProfessionalCredential` past `pending`. Before this module, every real
 * credential submission (apps/coach-mobile's onboarding) landed on
 * `pending` and stayed there forever — see professionalOnboarding.service.ts's
 * own comment. This closes that loop for real.
 *
 * **What's real vs. honestly not modeled**, against the Figma's fuller
 * spec:
 * - 03.01 Directory columns: Professional/Services/Experience/Active
 *   Clients/Status are real. Region, Languages, Rating, and Earnings (MTD)
 *   have NO backing field anywhere in this schema (no region/language
 *   fields on `Professional`, no `Review` entity, no per-professional
 *   payment/earnings ledger) — omitted from the response entirely rather
 *   than sent as `null`/`0`, which would misrepresent "no data modeled" as
 *   "genuinely zero".
 * - Directory tabs: "Credentials Expiring" always returns an empty list —
 *   `ProfessionalCredential` has no expiry-date field (the reviewed
 *   coach-app screens never showed one either).
 * - 03.02 Profile tabs: Overview/Clients/Credentials are real (the last one
 *   doubles as this same verification flow). Sessions/Earnings/Reviews are
 *   still returned as an explicit `notAvailable` list, same convention as
 *   adminDashboard/professionalDashboard — but as of 25 Aug 2026 that's a
 *   genuine follow-up rather than an infra blocker for Sessions
 *   specifically: a `Booking` entity now exists (see the `coaching`
 *   module), this endpoint just doesn't join it in yet. Earnings and
 *   Reviews remain properly unmodeled (no per-professional payment ledger,
 *   no Review model).
 * - 03.03 Credential Verification: Approve/Reject per credential AND for
 *   the shared KYC check are real (`verifyCredential`/`verifyKyc` below),
 *   as is "Suspend Application" (`suspendProfessional`, maps to
 *   `Professional.status`). "Request Info" is NOT wired — `CredentialStatus`
 *   has no state that means "more info requested" (not_verified / pending
 *   / verified / rejected), and adding one just to make a button clickable
 *   would misrepresent what actually happens when it's pressed; a real
 *   admin note can already be attached via `adminNotes` on either action.
 *
 * Deliberately does NOT import `Professional`/`ProfessionalCredential` as
 * Prisma model types — same reasoning as users.service.ts's toPublicUser.
 */

type CredentialRow = { id: string; serviceType: string; status: string; expiresAt: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;

// Credential-expiry admin warning window (R2 Wave 6.2, 22 Sep 2026) — the
// later-wave hook `ProfessionalCredential.expiresAt`'s own schema comment
// named ("surfaces a real Admin Action Required item 30 days ahead"). This
// is a READ, not a write, of the policy that field's comment already
// defines: 12 months validity from verification, soft-only (never
// auto-suspends, see that comment) — this wave only adds visibility.
const CREDENTIAL_EXPIRY_WARNING_WINDOW_MS = 30 * DAY_MS;
const CREDENTIAL_VALIDITY_MONTHS = 12;

function isExpiringSoon(credential: CredentialRow, cutoff: Date): boolean {
  return credential.status === "verified" && !!credential.expiresAt && credential.expiresAt.getTime() <= cutoff.getTime();
}

/**
 * Read-time detection + admin-queue write for a `ProfessionalCredential`
 * that's `verified` and within (or past) CREDENTIAL_EXPIRY_WARNING_WINDOW_MS
 * of `expiresAt`. Mirrors professionalDashboard.service.ts's
 * `detectAndQueueStuckRelationships` exactly: computed at READ time (this
 * codebase has no scheduler/cron infra anywhere — same documented
 * precedent), idempotent via a dedup check against an existing OPEN
 * AdminActionItem for the same (type, entityType, entityId) before
 * creating a new one, so a directory that's polled repeatedly can't spawn
 * duplicate queue rows for the same expiring credential.
 *
 * Runs across ALL professionals (unlike the per-coach stuck-relationship
 * sweep) because its call site, `listProfessionals`, is itself the
 * admin-wide directory read — there's no equivalent "this one coach's own
 * dashboard" scope to detect within here.
 *
 * Severity: `high` once a credential has actually lapsed (`expiresAt` is
 * already in the past) — genuinely more urgent than one still inside the
 * warning window, which gets `medium` (matching `credential_verification_
 * pending`'s own severity for "needs an admin look, not yet urgent").
 */
async function detectAndQueueExpiringCredentials(cutoff: Date, now: Date): Promise<void> {
  const expiring = await prisma.professionalCredential.findMany({
    where: { status: "verified", expiresAt: { lte: cutoff } },
    select: { id: true, professionalId: true, serviceType: true, expiresAt: true },
  });

  for (const credential of expiring as Array<{
    id: string;
    professionalId: string;
    serviceType: string;
    expiresAt: Date | null;
  }>) {
    const existingOpen = await prisma.adminActionItem.findFirst({
      where: { type: "credential_expiring", entityType: "ProfessionalCredential", entityId: credential.id, status: "open" },
      select: { id: true },
    });
    if (existingOpen) continue;

    const alreadyExpired = !!credential.expiresAt && credential.expiresAt.getTime() < now.getTime();
    await createActionItem({
      type: "credential_expiring",
      entityType: "ProfessionalCredential",
      entityId: credential.id,
      severity: alreadyExpired ? "high" : "medium",
      metadata: {
        professionalId: credential.professionalId,
        serviceType: credential.serviceType,
        expiresAt: credential.expiresAt?.toISOString() ?? null,
      },
    });
  }
}

function computeDirectoryBucket(
  professional: {
    status: string;
    kycStatus: string;
    credentials: CredentialRow[];
  },
  expiryCutoff: Date,
): { pendingVerification: boolean; active: boolean; rejected: boolean; suspended: boolean; credentialsExpiring: boolean } {
  const hasPending = professional.credentials.some((c) => c.status === "pending") || professional.kycStatus === "pending";
  const hasVerified = professional.credentials.some((c) => c.status === "verified");
  const hasRejected = professional.credentials.some((c) => c.status === "rejected") || professional.kycStatus === "rejected";
  const hasExpiring = professional.credentials.some((c) => isExpiringSoon(c, expiryCutoff));

  return {
    pendingVerification: hasPending,
    // "Active" here means genuinely working, not just "account not
    // suspended" — an account with zero verified services yet shouldn't
    // show up as an active coach in this tab, even though `Professional.status`
    // is still technically `active` (that field just means "not suspended").
    active: professional.status === "active" && hasVerified,
    rejected: hasRejected,
    suspended: professional.status === "suspended",
    credentialsExpiring: hasExpiring,
  };
}

export async function listProfessionals(query: ListProfessionalsQuery) {
  const now = new Date();
  const expiryCutoff = new Date(now.getTime() + CREDENTIAL_EXPIRY_WARNING_WINDOW_MS);

  // Credential-expiry sweep (R2 Wave 6.2) — read-time detection off this
  // same directory read, the sensible endpoint per this wave's own scope
  // (no scheduler infra exists to run it any other way). See
  // detectAndQueueExpiringCredentials's own doc comment.
  await detectAndQueueExpiringCredentials(expiryCutoff, now);

  const professionals = await prisma.professional.findMany({
    where: query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      credentials: { select: { id: true, serviceType: true, status: true, expiresAt: true } },
      relationships: { where: { status: "active" }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = (
    professionals as Array<{
      id: string;
      fullName: string;
      email: string;
      status: string;
      kycStatus: string;
      yearsExperience: number | null;
      credentials: CredentialRow[];
      relationships: unknown[];
      // R2 Wave 2 (20 Sep 2026) — see this function's own return mapping.
      lifecycleStatus: string;
      maxActiveClients: number;
    }>
  ).map((p) => ({
    ...p,
    bucket: computeDirectoryBucket(p, expiryCutoff),
  }));

  const counts = {
    all: rows.length,
    pendingVerification: rows.filter((r) => r.bucket.pendingVerification).length,
    active: rows.filter((r) => r.bucket.active).length,
    rejected: rows.filter((r) => r.bucket.rejected).length,
    suspended: rows.filter((r) => r.bucket.suspended).length,
    // R2 Wave 6.2 (22 Sep 2026) — real now that `expiresAt` is actually
    // written (verifyCredential below) and read (computeDirectoryBucket
    // above), no longer hardcoded to 0.
    credentialsExpiring: rows.filter((r) => r.bucket.credentialsExpiring).length,
  };

  const filtered =
    query.tab === "all"
      ? rows
      : rows.filter(
          (r) => r.bucket[query.tab as "pendingVerification" | "active" | "rejected" | "suspended" | "credentialsExpiring"],
        );

  return {
    professionals: filtered.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      email: p.email,
      status: p.status,
      kycStatus: p.kycStatus,
      yearsExperience: p.yearsExperience,
      services: p.credentials.map((c) => ({ serviceType: c.serviceType, status: c.status, expiresAt: c.expiresAt })),
      activeClients: p.relationships.length,
      // R2 Wave 2 (20 Sep 2026) — real Directory-row surfacing of the
      // account-level lifecycle stage + capacity R2 Wave 1 shipped with no
      // UI reader anywhere. Already selected on every row above (no
      // `select` on the underlying `findMany`, so all scalars come back);
      // this just stops dropping them on the floor before the response.
      lifecycleStatus: p.lifecycleStatus,
      maxActiveClients: p.maxActiveClients,
    })),
    counts,
    // Figma-spec'd columns with no backing field — see this file's top
    // comment. Named here so the frontend can render them as an honest
    // "not available" note rather than assuming they were forgotten.
    notAvailable: ["region", "languages", "rating", "earningsMtd"],
  };
}

export async function getProfessionalDetail(id: string) {
  const professional = await prisma.professional.findUnique({
    where: { id },
    include: {
      credentials: { orderBy: { serviceType: "asc" } },
      relationships: {
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }

  const p = professional as {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    bio: string | null;
    specializationTags: string[];
    yearsExperience: number | null;
    status: string;
    kycStatus: string;
    kycDocumentData: string | null;
    adminNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    credentials: Array<{
      id: string;
      serviceType: string;
      certificationName: string | null;
      certifyingBody: string | null;
      yearObtained: number | null;
      certificationDocData: string | null;
      qualificationDocData: string | null;
      status: string;
      adminNotes: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    relationships: Array<{
      id: string;
      serviceType: string;
      status: string;
      createdAt: Date;
      endedAt: Date | null;
      user: { id: string; fullName: string; email: string };
    }>;
  };

  // Unlike toPublicProfessional (the coach's own view of themselves), the
  // admin review screen needs to actually see the KYC/certification
  // documents to review them — so kycDocumentData/*DocData are included
  // here, not stripped. Only passwordHash never leaves this function.
  // (`professional` here is untyped — see this file's top comment on why
  // Prisma model types aren't imported — so this destructure is left
  // unannotated rather than force-cast to a narrower shape.)
  const { passwordHash: _passwordHash, ...publicProfessional } = professional;

  return {
    professional: publicProfessional,
    clients: p.relationships.map((r) => ({
      relationshipId: r.id,
      userId: r.user.id,
      userFullName: r.user.fullName,
      userEmail: r.user.email,
      serviceType: r.serviceType,
      status: r.status,
      createdAt: r.createdAt,
      endedAt: r.endedAt,
    })),
    // Sessions/Earnings/Reviews tabs (03.02) — Sessions could now be
    // derived from the real `Booking` entity (25 Aug 2026, `coaching`
    // module) as a follow-up; Earnings/Reviews still have no backing
    // entity (no per-professional payment ledger, no Review model). See
    // this file's top comment.
    notAvailable: ["sessions", "earnings", "reviews"],
  };
}

async function getCredentialOrThrow(professionalId: string, credentialId: string) {
  const credential = await prisma.professionalCredential.findUnique({ where: { id: credentialId } });
  if (!credential || (credential as { professionalId: string }).professionalId !== professionalId) {
    throw new ApiHttpError(404, "not_found", "Credential not found for this professional");
  }
  return credential;
}

export async function verifyCredential(
  adminId: string,
  professionalId: string,
  credentialId: string,
  input: VerifyCredentialInput,
) {
  await getCredentialOrThrow(professionalId, credentialId);

  // Expiry write path (R2 Wave 6.2, 22 Sep 2026) — the real moment
  // `ProfessionalCredential.expiresAt`'s own schema comment names ("only
  // ever set the moment verifyCredential actually approves a credential"):
  // 12 months from THIS approval, flat policy per that comment (no
  // per-certifying-body validity concept exists, out of scope per both R1
  // work packages). A rejection leaves `expiresAt` untouched — it's not a
  // verified credential either way, so there's nothing to (re)expire.
  const expiresAt =
    input.status === "verified"
      ? (() => {
          const next = new Date();
          next.setMonth(next.getMonth() + CREDENTIAL_VALIDITY_MONTHS);
          return next;
        })()
      : undefined;

  const updated = await prisma.professionalCredential.update({
    where: { id: credentialId },
    data: { status: input.status, adminNotes: input.adminNotes ?? undefined, ...(expiresAt ? { expiresAt } : {}) },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: input.status === "verified" ? "admin.professional_credential.verified" : "admin.professional_credential.rejected",
    entityType: "ProfessionalCredential",
    entityId: credentialId,
    metadata: { professionalId, adminNotes: input.adminNotes },
  });

  // R2 Wave 1 (20 Sep 2026) — a credential clearing (or a professional's
  // last verified credential being rejected) can move
  // `Professional.lifecycleStatus` across the verification->approved
  // boundary or the approved<->available boundary. See
  // professionalLifecycle.service.ts's own doc comment for why both are
  // called unconditionally here rather than only on `verified`: rejecting
  // a professional's only verified credential needs the same recompute to
  // demote them back out of `available`.
  await professionalLifecycleService.maybeAdvanceToApproved(adminId, professionalId);
  await professionalLifecycleService.recomputeAvailability(professionalId, adminId);

  return updated;
}

export async function verifyKyc(adminId: string, professionalId: string, input: VerifyKycInput) {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { kycStatus: input.status, adminNotes: input.adminNotes ?? undefined },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: input.status === "verified" ? "admin.professional_kyc.verified" : "admin.professional_kyc.rejected",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { adminNotes: input.adminNotes },
  });

  // R2 Wave 1 (20 Sep 2026) — KYC clearing is the other half of the
  // verification -> approved gate (alongside a verified credential, see
  // verifyCredential above). A KYC rejection can't demote an already-
  // `approved`/`available` professional on its own (`approved` requires
  // both to have cleared once, and this wave's decision was not to build a
  // KYC-expiry/re-check concept) — recomputeAvailability is still safe to
  // call unconditionally since it only ever moves the approved<->available
  // boundary off the credential precondition, which this action doesn't
  // change.
  await professionalLifecycleService.maybeAdvanceToApproved(adminId, professionalId);
  await professionalLifecycleService.recomputeAvailability(professionalId, adminId);

  return updated;
}

export async function suspendProfessional(adminId: string, professionalId: string, input: SuspendProfessionalInput) {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { status: "suspended", adminNotes: input.adminNotes ?? undefined },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.professional.suspended",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { adminNotes: input.adminNotes },
  });

  // R2 Wave 1 (20 Sep 2026) — keeps `lifecycleStatus` in step with `status`
  // rather than leaving it stale at whatever stage the professional was in
  // the moment they got suspended. See professionalLifecycle.service.ts's
  // own doc comment for how this is restored on reactivation.
  await professionalLifecycleService.suspendLifecycle(adminId, professionalId);

  return updated;
}

export async function reactivateProfessional(adminId: string, professionalId: string) {
  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) {
    throw new ApiHttpError(404, "not_found", "Professional not found");
  }

  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { status: "active" },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "admin.professional.reactivated",
    entityType: "Professional",
    entityId: professionalId,
  });

  // R2 Wave 1 (20 Sep 2026) — restores `lifecycleStatus` to whatever stage
  // it was at before suspension (or recomputes it from real signals if no
  // suspend record exists) instead of leaving it stuck at `suspended`.
  await professionalLifecycleService.restoreLifecycleAfterReactivation(adminId, professionalId);

  return updated;
}

/**
 * R2 Wave 1 (20 Sep 2026) — admin-editable capacity, the admin-console
 * counterpart to professionalLifecycle.routes.ts's own PUT
 * /professionals/me/capacity (a coach editing their own cap). Same
 * underlying service function, different actor attribution.
 */
export async function updateMaxActiveClients(
  adminId: string,
  professionalId: string,
  input: AdminUpdateMaxActiveClientsInput,
) {
  return professionalLifecycleService.updateMaxActiveClients(professionalId, input, { adminId });
}
