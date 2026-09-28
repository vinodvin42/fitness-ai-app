import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createActionItem } from "../../lib/adminActionQueue";
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

const HOUR_MS = 60 * 60 * 1000;

// Stalled-offer detection (Wave 6, 22 Sep 2026) — `AdminActionItemType`
// already named `professional_acceptance_stalled` since R2 Wave 1, never
// wired up (its own doc comment named this as depending on this module
// landing first — see schema.prisma's AdminActionItemType comment). Mirrors
// professionalDashboard.service.ts's `detectAndQueueStuckRelationships`
// exactly: read-time detection (no scheduler/cron infra in this codebase,
// same documented precedent), dedup-before-create against an existing open
// AdminActionItem, run inside an already-polled read path rather than a
// background sweep.
//
// The threshold itself is deliberately NOT the stuck-relationship unit's
// 15 minutes — that threshold times a fully automated, sub-second sequence
// of DB writes (claimRelationship -> booking.create -> updateMany), so
// anything still mid-flight 15 minutes later is a genuine system failure.
// An offer sitting at `offered` is waiting on a real HUMAN decision by the
// professional, not a system step — 15 minutes would flag nearly every
// offer ever created. 72 hours (3 days) is the threshold instead: long
// enough that a professional checking their app once a day still has a
// full response window, short enough that a client proposed a coach isn't
// left waiting indefinitely with no admin visibility. This is intentionally
// a DIFFERENT, later signal than `expiresAt` (professionalOffers.schema.ts's
// own optional field, enforced lazily by `expireIfStale` below): `expiresAt`
// is a per-offer, admin-chosen hard cutoff after which the offer can no
// longer be accepted at all; `stalled` is a "no response yet" admin nudge
// that fires independently of whether an expiry was even set — most offers
// today set no `expiresAt`, which is exactly the case with no other signal
// this closes. An offer already past its own `expiresAt` is excluded here
// (it's "expired", not "stalled" — a semantically different, already-real
// terminal state) rather than double-signaled.
const STALLED_OFFER_THRESHOLD_MS = 72 * HOUR_MS;

type StalledOfferRow = {
  id: string;
  professionalId: string;
  userId: string;
  serviceType: string;
  createdAt: Date;
  expiresAt: Date | null;
  professional: { fullName: string };
  user: { fullName: string };
};

/**
 * Read-time detection + admin-queue write for `ProfessionalOffer` rows
 * still `offered` past STALLED_OFFER_THRESHOLD_MS — see this file's own
 * const comment above for the full reasoning. Idempotent per offer, same
 * "at most one open AdminActionItem per real stuck thing" discipline
 * `detectAndQueueStuckRelationships` uses: checks for an existing
 * (type, entityType, entityId) row with `status: "open"` before creating.
 * Run from `listOffers` (the admin-facing read this wires visibility
 * into), not from the coach-facing `listOffersForProfessional` — the
 * professional isn't the audience for "an admin should look at this."
 */
async function detectAndQueueStalledOffers(): Promise<void> {
  const cutoff = new Date(Date.now() - STALLED_OFFER_THRESHOLD_MS);
  const stalled = await prisma.professionalOffer.findMany({
    where: {
      status: ACTIONABLE_OFFER_STATUS,
      createdAt: { lt: cutoff },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      professional: { select: { fullName: true } },
      user: { select: { fullName: true } },
    },
  });
  const rows = stalled as StalledOfferRow[];

  for (const offer of rows) {
    const existingOpen = await prisma.adminActionItem.findFirst({
      where: {
        type: "professional_acceptance_stalled",
        entityType: "ProfessionalOffer",
        entityId: offer.id,
        status: "open",
      },
      select: { id: true },
    });
    if (existingOpen) continue;

    await createActionItem({
      type: "professional_acceptance_stalled",
      entityType: "ProfessionalOffer",
      entityId: offer.id,
      severity: "medium",
      metadata: {
        professionalId: offer.professionalId,
        professionalFullName: offer.professional.fullName,
        userId: offer.userId,
        userFullName: offer.user.fullName,
        serviceType: offer.serviceType,
        offeredSince: offer.createdAt.toISOString(),
        expiresAt: offer.expiresAt ? offer.expiresAt.toISOString() : null,
      },
    });
  }
}

type OfferRow = {
  id: string;
  professionalId: string;
  userId: string;
  serviceType: string;
  status: string;
  proposedByAdminId: string | null;
  proposedByProfessionalId: string | null;
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

type OfferProposer = { adminId: string; professionalId?: undefined } | { adminId?: undefined; professionalId: string };

/**
 * Shared creation path — enforces the real `available` precondition via
 * `professionalLifecycle.service.ts#isAvailableForNewClients` (the actual
 * gate other modules are meant to call, per that function's own doc
 * comment) rather than re-deriving it from `lifecycleStatus` directly.
 *
 * **Wave 3 (20 Sep 2026):** factored out of what used to be `createOffer`'s
 * own body so a SECOND real proposer — the ending coach on a Handover
 * action (relationshipLifecycle.service.ts's `handoverRelationship`) —
 * can create a real offer through the exact same precondition check and
 * row-creation logic as the admin-driven path, rather than a second,
 * copy-pasted version of this function. `createOffer` (admin) and
 * `createOfferAsProfessional` (coach handover) below are both now thin
 * wrappers over this, preserving `createOffer`'s existing
 * `(adminId, input)` call signature for its existing callers (the admin
 * route and this module's own tests).
 */
async function createOfferInternal(proposer: OfferProposer, input: CreateOfferInput) {
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
      proposedByAdminId: proposer.adminId ?? null,
      proposedByProfessionalId: proposer.professionalId ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });

  await recordAudit({
    actorAdminId: proposer.adminId ?? null,
    actorProfessionalId: proposer.professionalId ?? null,
    action: "professional_offer.created",
    entityType: "ProfessionalOffer",
    entityId: offer.id,
    metadata: { professionalId: input.professionalId, userId: input.userId, serviceType: input.serviceType },
  });

  return offer;
}

/** Admin-driven creation (admin-web's "Propose Professional") — unchanged call signature. */
export async function createOffer(adminId: string, input: CreateOfferInput) {
  return createOfferInternal({ adminId }, input);
}

/**
 * Coach-driven creation — the new real proposer this wave adds. Only ever
 * called internally by relationshipLifecycle.service.ts's
 * `handoverRelationship`, never exposed as its own public "a coach can
 * propose any offer" route (Handover is the one real product path that
 * creates one this way — see this wave's own scope note).
 */
export async function createOfferAsProfessional(professionalId: string, input: CreateOfferInput) {
  return createOfferInternal({ professionalId }, input);
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
 * Coach-facing listing — backs the "Offers from FynroX" section of
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

/**
 * Admin-facing listing — Module 03/04's own Directory-style filter shape.
 * Also the real read-time trigger for `detectAndQueueStalledOffers` (see
 * its own doc comment above) — every admin read of the offers queue is a
 * chance to catch a newly-stalled offer, same "runs on every poll of the
 * already-real read path" discipline `getDashboardStats` uses for stuck
 * relationships. Fired unconditionally (not scoped to this call's own
 * `query` filters) since a stalled offer should surface regardless of what
 * filter the admin happened to apply.
 */
export async function listOffers(query: ListOffersQuery) {
  await detectAndQueueStalledOffers();

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
      proposedByProfessionalId: o.proposedByProfessionalId,
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
 *
 * **Wave 3 (20 Sep 2026):** also the exact function apps/coach-mobile's new
 * Handover replacement-professional picker reuses (via a professional-authed
 * route in this file's router, `GET /professionals/me/available-professionals`)
 * — same "reuse the one real 'pick a professional' pattern, don't invent a
 * second one" discipline the R1 U6 work names explicitly. `excludeProfessionalId`
 * is the one real addition that picker needed: a coach handing off a client
 * obviously can't propose themselves as their own replacement.
 */
export async function listAvailableProfessionals(query: ListAvailableProfessionalsQuery, excludeProfessionalId?: string) {
  const where: Record<string, unknown> = { lifecycleStatus: "available", status: "active" };
  if (excludeProfessionalId) {
    where.id = { not: excludeProfessionalId };
  }
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
