import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import {
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

type CredentialRow = { serviceType: string; status: string };

function computeDirectoryBucket(professional: {
  status: string;
  kycStatus: string;
  credentials: CredentialRow[];
}): { pendingVerification: boolean; active: boolean; rejected: boolean; suspended: boolean } {
  const hasPending = professional.credentials.some((c) => c.status === "pending") || professional.kycStatus === "pending";
  const hasVerified = professional.credentials.some((c) => c.status === "verified");
  const hasRejected = professional.credentials.some((c) => c.status === "rejected") || professional.kycStatus === "rejected";

  return {
    pendingVerification: hasPending,
    // "Active" here means genuinely working, not just "account not
    // suspended" — an account with zero verified services yet shouldn't
    // show up as an active coach in this tab, even though `Professional.status`
    // is still technically `active` (that field just means "not suspended").
    active: professional.status === "active" && hasVerified,
    rejected: hasRejected,
    suspended: professional.status === "suspended",
  };
}

export async function listProfessionals(query: ListProfessionalsQuery) {
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
      credentials: { select: { serviceType: true, status: true } },
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
    }>
  ).map((p) => ({
    ...p,
    bucket: computeDirectoryBucket(p),
  }));

  const counts = {
    all: rows.length,
    pendingVerification: rows.filter((r) => r.bucket.pendingVerification).length,
    active: rows.filter((r) => r.bucket.active).length,
    rejected: rows.filter((r) => r.bucket.rejected).length,
    suspended: rows.filter((r) => r.bucket.suspended).length,
    // See this file's top comment — no expiry field exists to compute this
    // from, so it's always 0, not fabricated.
    credentialsExpiring: 0,
  };

  const filtered =
    query.tab === "all"
      ? rows
      : query.tab === "credentialsExpiring"
        ? []
        : rows.filter((r) => r.bucket[query.tab as "pendingVerification" | "active" | "rejected" | "suspended"]);

  return {
    professionals: filtered.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      email: p.email,
      status: p.status,
      kycStatus: p.kycStatus,
      yearsExperience: p.yearsExperience,
      services: p.credentials.map((c) => ({ serviceType: c.serviceType, status: c.status })),
      activeClients: p.relationships.length,
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

  const updated = await prisma.professionalCredential.update({
    where: { id: credentialId },
    data: { status: input.status, adminNotes: input.adminNotes ?? undefined },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: input.status === "verified" ? "admin.professional_credential.verified" : "admin.professional_credential.rejected",
    entityType: "ProfessionalCredential",
    entityId: credentialId,
    metadata: { professionalId, adminNotes: input.adminNotes },
  });

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

  return updated;
}
