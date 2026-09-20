import { z } from "zod";

/**
 * Relationship Lifecycle — End Relationship / Handover (R1 U6, Wave 3,
 * 20 Sep 2026). See relationshipLifecycle.service.ts's own doc comment for
 * the full design: End Relationship is the real, professional- or
 * admin-initiated transition to `Relationship.status: "ended"` that never
 * existed before this wave (the only prior path to `ended` was a coach
 * declining a still-`requested` row, or an admin's own pre-existing
 * `/admin/relationships/:id/end`); Handover is End Relationship plus an
 * optional real `ProfessionalOffer` for a named replacement — never a
 * second, parallel state machine.
 *
 * Both actions are BR-ADM-005 "high-impact action" discipline: a real,
 * required reason — same "reason required, not optional" upgrade this wave
 * also applies to the pre-existing admin `/admin/relationships/:id/end`
 * route (adminRelationships.schema.ts's own `endRelationshipSchema`, which
 * used to accept `reason` as optional).
 */
export const endRelationshipActionSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});
export type EndRelationshipActionInput = z.infer<typeof endRelationshipActionSchema>;

// `replacementProfessionalId` is optional — per this wave's own real
// product decision (see relationshipLifecycle.service.ts's top comment),
// Handover IS End Relationship when no replacement is proposed; the
// replacement professional id is the one and only thing that
// distinguishes the two. Same "non-empty string, not `.uuid()`" id
// convention as every other entity id schema in this build (seed data uses
// readable ids like "coach-alex-rivera").
export const handoverRelationshipSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  replacementProfessionalId: z.string().min(1).max(191).optional(),
});
export type HandoverRelationshipInput = z.infer<typeof handoverRelationshipSchema>;
