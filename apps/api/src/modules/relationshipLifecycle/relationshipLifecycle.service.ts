import { prisma } from "../../db/prisma";
import { recordAudit } from "../../middleware/auditLog";
import { trackEvent } from "../../lib/analytics";
import { ApiHttpError } from "../../middleware/errorHandler";
import { createOffer, createOfferAsProfessional } from "../professionalOffers/professionalOffers.service";

/**
 * Relationship Lifecycle — End Relationship / Handover (R1 U6, Wave 3,
 * 20 Sep 2026).
 *
 * A dedicated audit confirmed no professional- or admin-initiated "end
 * relationship"/"handover" flow existed before this wave — reconfirmed
 * against this build's actual code: `Relationship.status` reaching `ended`
 * before this wave had exactly two real paths, both narrower than a real
 * lifecycle action —
 * `coaching.service.ts#declineRelationship` (a coach declining a still-
 * `requested` row, before it's ever `active`) and the pre-existing admin
 * `/admin/relationships/:id/end` (adminRelationships.service.ts) — and
 * NEITHER professional actor had any way at all to end an `active`
 * relationship they're already coaching, nor did either path support
 * proposing a replacement in the same action. This module is that real,
 * missing transition, shared by both real actors (professional and admin)
 * rather than two divergent implementations of the same state change.
 *
 * **The real product decision already made (not re-decided here):**
 * Handover creates a new `ProfessionalOffer` — no second "transfer" data
 * model. `handoverRelationship` below is a real superset of
 * `endRelationship`, composing it with `professionalOffers.service.ts`'s
 * own, unmodified `createOffer`/`createOfferAsProfessional` (which in turn
 * still enforces the exact same `isAvailableForNewClients` precondition
 * and still converges through `coaching.service.ts#claimRelationship` once
 * the replacement accepts — see that module's own top comment). No
 * replacement proposed means it's plainly `endRelationship` — Handover
 * does not fork into a separate state machine.
 *
 * **Authorization:** a professional actor may only act on a relationship
 * where `relationship.professionalId` is genuinely theirs — enforced as a
 * 404 (not 403), the same "never confirm a relationshipId exists to an
 * actor with no business seeing it" convention
 * `coaching.service.ts#acceptRelationship`/`declineRelationship` already
 * use. An admin actor has no ownership restriction, same as the
 * pre-existing `/admin/relationships/:id/end`.
 *
 * **Reason discipline:** both actions require a real, non-empty reason
 * (`relationshipLifecycle.schema.ts`) — BR-ADM-005 "high-impact actions
 * require reason + audit" applied consistently, including upgrading the
 * pre-existing admin End Relationship action (previously optional-reason,
 * plain textarea) to the same bar. Reused as `Relationship.endReason` —
 * that column already existed for the coach-decline path
 * (schema.prisma's own comment on it); this is the same field, now set by
 * every real path that ends a relationship, not just decline.
 */

type Actor = { professionalId: string; adminId?: undefined } | { adminId: string; professionalId?: undefined };

type RelationshipRow = {
  id: string;
  professionalId: string;
  userId: string;
  serviceType: "fitness" | "nutrition";
  status: string;
  createdAt: Date;
  endedAt: Date | null;
  endReason: string | null;
};

function actorAuditFields(actor: Actor) {
  return { actorAdminId: actor.adminId ?? null, actorProfessionalId: actor.professionalId ?? null };
}

async function getOwnedRelationshipOrThrow(actor: Actor, relationshipId: string): Promise<RelationshipRow> {
  const relationship = await prisma.relationship.findUnique({ where: { id: relationshipId } });
  const rel = relationship as RelationshipRow | null;
  if (!rel) {
    throw new ApiHttpError(404, "relationship_not_found", "Relationship not found");
  }
  if (actor.professionalId && rel.professionalId !== actor.professionalId) {
    throw new ApiHttpError(404, "relationship_not_found", "Relationship not found");
  }
  return rel;
}

/**
 * The real state transition: any non-`ended` relationship this actor
 * genuinely owns (or any relationship at all, for an admin actor) moves to
 * `ended` with a real `endedAt`/`endReason` and a real `recordAudit` entry.
 * Callable directly (professional/admin "End Relationship") or as the
 * first half of `handoverRelationship` below.
 */
export async function endRelationship(actor: Actor, relationshipId: string, reason: string): Promise<RelationshipRow> {
  const relationship = await getOwnedRelationshipOrThrow(actor, relationshipId);

  if (relationship.status === "ended") {
    throw new ApiHttpError(409, "relationship_already_ended", "This relationship has already ended");
  }

  const updated = await prisma.relationship.update({
    where: { id: relationshipId },
    data: { status: "ended", endedAt: new Date(), endReason: reason },
  });

  await recordAudit({
    ...actorAuditFields(actor),
    action: actor.professionalId ? "professional.relationship.ended" : "admin.relationship.ended",
    entityType: "Relationship",
    entityId: relationshipId,
    metadata: { reason, previousStatus: relationship.status },
  });

  // "relationship.ended" — mirrors coaching.service.ts's own
  // "relationship.activated" precedent of reporting real relationship
  // state changes as analytics events, keyed to the affected user (the
  // client), not the acting professional/admin.
  await trackEvent(relationship.userId, "relationship.ended", {
    relationshipId,
    professionalId: relationship.professionalId,
  });

  return updated as RelationshipRow;
}

/**
 * End Relationship + optional real replacement `ProfessionalOffer` in one
 * action. `replacementProfessionalId` omitted (or equal to the current
 * professional, which is refused as a real validation error rather than a
 * silent no-op) means this is plainly `endRelationship` above — there is
 * no separate "handover" state on `Relationship` itself.
 */
export async function handoverRelationship(
  actor: Actor,
  relationshipId: string,
  reason: string,
  replacementProfessionalId?: string,
): Promise<{ relationship: RelationshipRow; offer: Awaited<ReturnType<typeof createOffer>> | null }> {
  if (replacementProfessionalId) {
    // Validate against the PRE-end row (ownership already enforced by
    // endRelationship below, but a same-professional replacement is a real
    // input error worth catching before mutating anything).
    const before = await getOwnedRelationshipOrThrow(actor, relationshipId);
    if (replacementProfessionalId === before.professionalId) {
      throw new ApiHttpError(
        400,
        "invalid_replacement",
        "The replacement professional must be different from the current one",
      );
    }
  }

  const ended = await endRelationship(actor, relationshipId, reason);

  if (!replacementProfessionalId) {
    return { relationship: ended, offer: null };
  }

  // The real convergence point (this module's own top comment) — reuse
  // professionalOffers.service.ts's own, unmodified creation logic (which
  // itself still enforces isAvailableForNewClients and still converges
  // through coaching.service.ts#claimRelationship once accepted) rather
  // than duplicating any of it here.
  const offer = actor.professionalId
    ? await createOfferAsProfessional(actor.professionalId, {
        professionalId: replacementProfessionalId,
        userId: ended.userId,
        serviceType: ended.serviceType,
      })
    : await createOffer(actor.adminId as string, {
        professionalId: replacementProfessionalId,
        userId: ended.userId,
        serviceType: ended.serviceType,
      });

  await recordAudit({
    ...actorAuditFields(actor),
    action: "relationship.handover",
    entityType: "Relationship",
    entityId: relationshipId,
    metadata: { reason, replacementProfessionalId, offerId: offer.id },
  });

  return { relationship: ended, offer };
}
