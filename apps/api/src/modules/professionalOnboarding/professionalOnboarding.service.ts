import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createActionItem } from "../../lib/adminActionQueue";
import { SelectServicesInput, SubmitCredentialInput, SubmitKycInput } from "./professionalOnboarding.schema";

/**
 * Coach onboarding (Phase 5, docs/coach/03-screen-inventory.md §B) — three
 * linear steps: select services, submit a per-service credential, submit
 * a shared KYC document. "Onboarding completed" (what apps/coach-mobile's
 * RootNavigator branches Auth -> Onboarding -> MainTabs on, mirroring
 * apps/user-mobile's own onboardingCompleted flag) means "has selected at
 * least one service" — matching the Figma's own Verification Status
 * screen, which is the onboarding wizard's landing/final step and offers
 * a "Go to Dashboard" CTA even while verification is still pending
 * (docs/coach/01-product-requirements.md §4: a coach can go live on one
 * verified service while another is still under review). It does NOT mean
 * "fully verified" — that gate belongs to individual client-facing
 * features (none of which are built yet, since discovery/booking itself
 * isn't), not to whether the coach can see their own dashboard at all.
 */

export async function hasSelectedServices(professionalId: string): Promise<boolean> {
  const count = await prisma.professionalCredential.count({ where: { professionalId } });
  return count > 0;
}

export async function selectServices(professionalId: string, input: SelectServicesInput) {
  // Additive only — creates a credential row for any newly-selected
  // service that doesn't already have one. Deliberately does NOT delete a
  // row for a service the professional stops selecting (the Figma copy
  // says selections "can be updated later", but a service already
  // verified or with submitted documents shouldn't silently lose that
  // data because of a later onboarding-step edit).
  await Promise.all(
    input.services.map((serviceType) =>
      prisma.professionalCredential.upsert({
        where: { professionalId_serviceType: { professionalId, serviceType } },
        create: { professionalId, serviceType },
        update: {},
      }),
    ),
  );

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "professional.services_selected",
    entityType: "Professional",
    entityId: professionalId,
    metadata: { services: input.services },
  });

  return getOnboardingStatus(professionalId);
}

export async function submitCredential(professionalId: string, input: SubmitCredentialInput) {
  const existing = await prisma.professionalCredential.findUnique({
    where: { professionalId_serviceType: { professionalId, serviceType: input.serviceType } },
  });
  if (!existing) {
    throw new ApiHttpError(
      400,
      "service_not_selected",
      `Select ${input.serviceType} as a service before submitting its credential`,
    );
  }

  const { serviceType: _serviceType, ...fields } = input;
  const updated = await prisma.professionalCredential.update({
    where: { professionalId_serviceType: { professionalId, serviceType: input.serviceType } },
    data: {
      ...fields,
      // Always resets to pending on a re-submission (e.g. after a rejection)
      // — the admin Credential Verification screen (docs/admin/03-screen-
      // inventory.md 03.03) IS real as of 21 Aug 2026 (adminProfessionals.
      // service.ts's verifyCredential/verifyKyc) and can move this to
      // verified/rejected for real; this line just makes sure a fresh
      // submission always starts the review queue over, not stuck at
      // whatever status a prior submission left it in.
      status: "pending",
    },
  });

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "professional_credential.submitted",
    entityType: "ProfessionalCredential",
    entityId: updated.id,
    metadata: { serviceType: input.serviceType },
  });

  // Admin Action Required queue (R2 Wave 1, 20 Sep 2026) — every (re-)
  // submission resets `status` to `pending` above, i.e. a real new review
  // cycle a human admin needs to act on (adminProfessionals.service.ts's
  // verifyCredential) — distinct from `credential_expiring`, which is a
  // later-wave hook off an already-verified credential's `expiresAt`.
  await createActionItem({
    type: "credential_verification_pending",
    entityType: "ProfessionalCredential",
    entityId: updated.id,
    severity: "medium",
    metadata: { professionalId, serviceType: input.serviceType },
  });

  return updated;
}

export async function submitKyc(professionalId: string, input: SubmitKycInput) {
  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { kycDocumentData: input.kycDocumentData, kycStatus: "pending" },
  });

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "professional.kyc_submitted",
    entityType: "Professional",
    entityId: professionalId,
  });

  return updated;
}

export async function getOnboardingStatus(professionalId: string) {
  const [credentials, professional] = await Promise.all([
    prisma.professionalCredential.findMany({
      where: { professionalId },
      orderBy: { serviceType: "asc" },
    }),
    prisma.professional.findUnique({
      where: { id: professionalId },
      select: { kycStatus: true },
    }),
  ]);

  return {
    credentials: credentials.map((c: { certificationDocData?: unknown; qualificationDocData?: unknown; [k: string]: unknown }) => {
      // Never echo the raw document data back — same boundary as
      // toPublicProfessional not returning kycDocumentData.
      const { certificationDocData: _cert, qualificationDocData: _qual, ...rest } = c;
      return rest;
    }),
    kycStatus: professional?.kycStatus ?? "not_verified",
  };
}
