import { z } from "zod";

/**
 * Professional Offers (R2 Wave 2, 20 Sep 2026) — see professionalOffers
 * .service.ts's own doc comment and schema.prisma's ProfessionalOffer model
 * comment for the full "why this is a new, parallel model" reasoning.
 */

// Entity ids are `String @id @default(uuid())` — uuid is only the default
// generator, not a DB constraint (seed data uses readable ids like
// "coach-alex-rivera"), same convention as coaching.schema.ts's
// createBookingSchema — a non-empty string is the right check, not
// `.uuid()`.
export const createOfferSchema = z.object({
  professionalId: z.string().min(1).max(191),
  userId: z.string().min(1).max(191),
  serviceType: z.enum(["fitness", "nutrition"]),
  // Real, shown-to-the-professional expiry — see the model's own comment
  // for why this is optional but enforced, not decorative, once set.
  expiresAt: z.string().datetime({ message: "expiresAt must be an ISO 8601 date-time" }).optional(),
});
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

// Coach-driven decline's optional free-text reason — same "short optional
// note, recorded via recordAudit rather than a dedicated column" shape as
// coaching.schema.ts's declineRelationshipSchema. `ProfessionalOffer` has
// no `reason`/`endReason` column of its own (see the model's field list) —
// this is audit-trail-only, not a stored column.
export const declineOfferSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type DeclineOfferInput = z.infer<typeof declineOfferSchema>;

// Admin-facing listing filter (listOffers) — filterable by status, and
// optionally scoped to one professional or one user.
export const listOffersQuerySchema = z.object({
  status: z.enum(["offered", "accepted", "declined", "expired"]).optional(),
  professionalId: z.string().min(1).max(191).optional(),
  userId: z.string().min(1).max(191).optional(),
});
export type ListOffersQuery = z.infer<typeof listOffersQuerySchema>;

// Coach-facing listing filter (listOffersForProfessional) — defaults to
// only the actionable `offered` ones (same "only the requested ones"
// default as coaching.service.ts's listPendingRelationships), but a coach
// can pass `status` to see their own past responses too.
export const listOffersForProfessionalQuerySchema = z.object({
  status: z.enum(["offered", "accepted", "declined", "expired"]).optional(),
});
export type ListOffersForProfessionalQuery = z.infer<typeof listOffersForProfessionalQuerySchema>;

// admin-web's "Propose Professional" dropdown/search — the real "list
// available professionals" read the R1 spec's §4 UI needs, a thin filter
// on top of the existing Discovery listing shape.
export const listAvailableProfessionalsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListAvailableProfessionalsQuery = z.infer<typeof listAvailableProfessionalsQuerySchema>;
