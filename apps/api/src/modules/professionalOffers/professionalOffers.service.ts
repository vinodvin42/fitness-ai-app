import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { isAvailableForNewClients } from "../professionalLifecycle/professionalLifecycle.service";
import { acceptRelationship, claimRelationship } from "../coaching/coaching.service";
import {
  CreateOfferInput,
  ListAvailableProfessionalsQuery,
  ListOffersForProfessionalQuery,
  ListOffersQuery,
} from "./professionalOffers.schema";

/**
 * Professional Offers (R2 Wave 2, 20 Sep 2026) — Developer 2's real R1 work
 * package §2 names the professional lifecycle as
 * `APPROVED -> AVAILABLE -> OFFERED/ASSIGNED -> ACCEPTED -> AWAITING_PAYMENT
 * -> ...`. Everything through `AVAILABLE` already exists
 * (professionalLifecycle.service.ts) and everything from `ACCEPTED` onward
 * is the existing, real, USER-initiated `Relationship` state machine
 * (coaching.service.ts). This module is the one real stage missing between
 * them: `OFFERED/ASSIGNED` — an ADMIN proposes a specific `available`
 * professional to a specific user, distinct from a user finding and
 * requesting their own coach through Discovery.
 *
 * **Real product decision made for this wave, not re-decided here:**
 * manual admin-proposes-a-specific-pro only, no auto-matching algorithm —
 * see schema.prisma's `ProfessionalOffer` model comment for the full
 * reasoning behind the new, parallel model (not an extension of
 * `Relationship`/`RelationshipStatus`).
 *
 * **The convergence point.** `acceptOffer` below deliberately does NOT
 * duplicate relationship-creation logic — it calls straight into
 * `coaching.service.ts`'s own `claimRelationship()` (the exact function a
 * user-initiated request creates a `Relationship` row through today), so
 * both flows land on the same real downstream mechanism (payment ->
 * activation -> active) without forking it. `claimRelationship()` always
 * leaves a brand-new relationship at `requested` — that's its own,
 * untouched, tested behavior (16 Sep 2026, gap §56) and this module does
 * not change it. What IS a genuine call made for this wave: since the
 * professional has already explicitly said yes by accepting the OFFER, this
 * function also calls the existing, separately real `acceptRelationship()`
 * right after, so the same coach isn't asked to approve the same
 * user/service pairing twice through two differently-named screens. This is
 * composing two existing, unmodified functions, not altering either one's
 * state machine — see this file's own top-of-repo doc comment
 * (docs/coach/07-open-questions-gaps.md + docs/admin/07-open-questions-gaps.md,
 * dated 20 Sep 2026) for the full write-up of this decision. If the claimed
 * relationship is anything OTHER than `requested` (already accepted/active/
 * etc. — e.g. the same pairing already existed from a prior user-initiated
 * request), it's left exactly as-is, same "never downgrade an existing
 * relationship" discipline `claimRelationship()` itself already documents.
 */

const ACTIONABLE_OFFER_STATUS = "offered";

type OfferRow = {
  id: string;
  professionalId: string;
  userId: string;
  serviceType: string;
  status: string;
  proposedByAdminId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  respondedAt: Date | null;
};

function isExpired(offer: { expiresAt: Date | null }): boolean {
  return !!offer.expiresAt && offer.expiresAt.getTime() <= Date.now();
}

/**
 * Lazily flips a stale `offered` row to `expired` the moment something
 * real reads or acts on it — no background sweep exists anywhere in this
 * codebase (no scheduler infra, see this wave's own "Explicit out of
 * scope" note), so this is the honest substitute: `expiresAt` is enforced
 * at every real read/write path rather than left to a cron job that
 * doesn't exist. Uses the same atomic `updateMany` + status-filter
 * discipline as every other claim-once transition in this build, so two
 * concurrent callers racing to expire the same row can't double-fire.
 */
async function expireIfStale(offer: OfferRow): Promise<OfferRow> {
  if (offer.status !== ACTIONABLE_OFFER_STATUS || !isExpired(offer)) return offer;

  const result = await prisma.professionalOffer.updateMany({
    where: { id: offer.id, status: ACTIONABLE_OFFER_STATUS },
    data: { status: "expired", respondedAt: new Date() },
  });
  if (result.count > 0) {
    await recordAudit({
      action: "professional_offer.expired",
      entityType: "ProfessionalOffer",
      entityId: offer.id,
      metadata: { professionalId: offer.professionalId, userId: offer.userId },
    });
  }

  return { ...offer, status: "expired" };
}

/**
 * Admin-driven creation — enforces the real `available` precondition via
 * `professionalLifecycle.service.ts#isAvailableForNewClients` (the actual
 * gate other modules are meant to call, per that function's own doc
 * comment) rather than re-deriving it from `lifecycleStatus` directly.
 */
export async function createOffer(adminId: string, input: CreateOfferInput) {
  const professional = await prisma.professional.findUnique({ where: { id: input.professionalId } });
  if (!professional) {
    throw new ApiHttpError(404, "professional_not_found", "Professional not found");
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    throw new ApiHttpError(404, "user_not_found", "User not found");
  }

  const available = await isAvailableForNewClients(input.professionalId);
  if (!available) {
    throw new ApiHttpError(
      409,
      "professional_not_available",
      "This professional isn't currently available for new clients",
    );
  }

  const offer = await prisma.professionalOffer.create({
    data: {
      professionalId: input.professionalId,
      userId: input.userId,
      serviceType: input.serviceType,
      status: "offered",
      proposedByAdminId: adminId,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });

  await recordAudit({
    actorAdminId: adminId,
    action: "professional_offer.created",
    entityType: "ProfessionalOffer",
    entityId: offer.id,
    metadata: { professionalId: input.professionalId, userId: input.userId, serviceType: input.serviceType },
  });

  return offer;
}

/**
 * Coach-driven acceptance. Atomic claim-once via `updateMany` + a
 * `status: "offered"` filter — same discipline as
 * `payments.service.ts#activatePayment`'s `updateMany` claim: only one of
 * two concurrent accept-taps (two coach devices, or a double-tap) actually
 * wins; the loser's `updateMany` affects zero rows and gets a clear 409
 * rather than silently double-accepting or double-creating a Relationship.
 * See this file's top comment for the accepted-offer -> Relationship
 * integration point.
 */
export async function acceptOffer(professionalId: string, offerId: string) {
  const existing = await prisma.professionalOffer.findUnique({ where: { id: offerId } });
  if (!existing || existing.professionalId !== professionalId) {
    throw new ApiHttpError(404, "offer_not_found", "Offer not found");
  }

  const current = await expireIfStale(existing as OfferRow);
  if (current.status === "expired") {
    throw new ApiHttpError(410, "offer_expired", "This offer has expired");
  }

  const claimed = await prisma.professionalOffer.updateMany({
    where: { id: offerId, professionalId, status: ACTIONABLE_OFFER_STATUS },
    data: { status: "accepted", respondedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApiHttpError(409, "offer_not_offered", "This offer has already been acted on");
  }

  // The real convergence point — reuse coaching.service.ts's own
  // relationship-creation logic rather than duplicating it. claimRelationship
  // is create-or-reuse and always leaves a brand-new triple at `requested`;
  // since this coach has already said yes via the offer, immediately move
  // it to `accepted` too (a real, separate, unmodified function) UNLESS the
  // claim actually reused a pre-existing relationship in some other status
  // (already accepted/awaiting_payment/activating/active/ — never touch
  // those, same "never downgrade" rule claimRelationship's own doc comment
  // already documents).
  const relationship = await claimRelationship(
    existing.userId,
    professionalId,
    existing.serviceType as "fitness" | "nutrition",
  );
  if (relationship.status === "requested") {
    await acceptRelationship(professionalId, relationship.id);
  }

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "professional_offer.accepted",
    entityType: "ProfessionalOffer",
    entityId: offerId,
    metadata: { userId: existing.userId, serviceType: existing.serviceType, relationshipId: relationship.id },
  });

  return { id: offerId, status: "accepted", relationshipId: relationship.id };
}

/**
 * Coach-driven decline — same atomic ownership+status-filtered claim as
 * `acceptOffer` above. Deliberately never touches `Relationship` — nothing
 * was ever created for a declined offer, so there's nothing to undo.
 */
export async function declineOffer(professionalId: string, offerId: string, reason?: string) {
  const existing = await prisma.professionalOffer.findUnique({ where: { id: offerId } });
  if (!existing || existing.professionalId !== professionalId) {
    throw new ApiHttpError(404, "offer_not_found", "Offer not found");
  }

  const current = await expireIfStale(existing as OfferRow);
  if (current.status === "expired") {
    throw new ApiHttpError(410, "offer_expired", "This offer has expired");
  }

  const result = await prisma.professionalOffer.updateMany({
    where: { id: offerId, professionalId, status: ACTIONABLE_OFFER_STATUS },
    data: { status: "declined", respondedAt: new Date() },
  });
  if (result.count === 0) {
    throw new ApiHttpError(409, "offer_not_offered", "This offer has already been acted on");
  }

  await recordAudit({
    actorProfessionalId: professionalId,
    action: "professional_offer.declined",
    entityType: "ProfessionalOffer",
    entityId: offerId,
    metadata: { userId: existing.userId, serviceType: existing.serviceType, reason: reason ?? null },
  });

  return { id: offerId, status: "declined" };
}

type OfferWithUserRow = OfferRow & { user: { fullName: string } };

/**
 * Coach-facing listing — backs the "Offers from PrimeFit" section of
 * apps/coach-mobile's Pending Requests screen. Defaults to only the
 * actionable `offered` ones, same "only the requested ones" default as
 * coaching.service.ts's listPendingRelationships, oldest first.
 */
export async function listOffersForProfessional(professionalId: string, query: ListOffersForProfessionalQuery) {
  const status = query.status ?? ACTIONABLE_OFFER_STATUS;
  const offers = await prisma.professionalOffer.findMany({
    where: { professionalId, status },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });

  const rows = (await Promise.all(
    (offers as OfferWithUserRow[]).map(async (o) => expireIfStale(o)),
  )) as OfferWithUserRow[];

  // If we're listing the default actionable bucket, a row that just got
  // lazily flipped to `expired` above no longer belongs in it.
  const filtered = status === ACTIONABLE_OFFER_STATUS ? rows.filter((r) => r.status === ACTIONABLE_OFFER_STATUS) : rows;

  return {
    offers: filtered.map((o) => ({
      offerId: o.id,
      userId: o.userId,
      userFullName: o.user.fullName,
      serviceType: o.serviceType,
      status: o.status,
      expiresAt: o.expiresAt,
      createdAt: o.createdAt,
    })),
  };
}

type OfferWithProfessionalAndUserRow = OfferRow & {
  professional: { fullName: string };
  user: { fullName: string };
};

/** Admin-facing listing — Module 03/04's own Directory-style filter shape. */
export async function listOffers(query: ListOffersQuery) {
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.professionalId) where.professionalId = query.professionalId;
  if (query.userId) where.userId = query.userId;

  const offers = await prisma.professionalOffer.findMany({
    where,
    include: {
      professional: { select: { fullName: true } },
      user: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = offers as OfferWithProfessionalAndUserRow[];

  return {
    offers: rows.map((o) => ({
      offerId: o.id,
      professionalId: o.professionalId,
      professionalFullName: o.professional.fullName,
      userId: o.userId,
      userFullName: o.user.fullName,
      serviceType: o.serviceType,
      status: o.status,
      proposedByAdminId: o.proposedByAdminId,
      expiresAt: o.expiresAt,
      createdAt: o.createdAt,
      respondedAt: o.respondedAt,
    })),
  };
}

type AvailableProfessionalRow = {
  id: string;
  fullName: string;
  bio: string | null;
  specializationTags: string[];
  yearsExperience: number | null;
};

/**
 * The real "list available professionals" read admin-web's Propose
 * Professional UI needs — a thin wrapper over
 * `isAvailableForNewClients()` + a professional list query, per this
 * wave's own scope note (nothing like this existed before this module).
 */
export async function listAvailableProfessionals(query: ListAvailableProfessionalsQuery) {
  const where: Record<string, unknown> = { lifecycleStatus: "available", status: "active" };
  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { bio: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const candidates = await prisma.professional.findMany({
    where,
    select: { id: true, fullName: true, bio: true, specializationTags: true, yearsExperience: true },
    orderBy: { fullName: "asc" },
  });

  const rows = candidates as AvailableProfessionalRow[];
  const availability = await Promise.all(rows.map((p) => isAvailableForNewClients(p.id)));

  return {
    professionals: rows
      .filter((_, i) => availability[i])
      .map((p) => ({
        id: p.id,
        fullName: p.fullName,
        bio: p.bio,
        specializationTags: p.specializationTags,
        yearsExperience: p.yearsExperience,
      })),
  };
}
