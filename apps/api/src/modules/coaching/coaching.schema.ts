import { z } from "zod";

/**
 * Coach Discovery & Booking (docs/coach/03-screen-inventory.md §E), added
 * 25 Aug 2026 — see coaching.service.ts's doc comment for the full "what's
 * real vs. simplified" breakdown.
 */

// "Fitness Coach / Nutrition Professional / Fitness + Nutrition" — the
// Discovery Filters screen's 3-category chip set (v1-coach's taxonomy,
// adopted over the consumer app's Yoga/Sports categories, which nothing
// else in the product supports — see gap §1). "combined" here means
// "verified for both services", not a credential/relationship value of
// its own — see schema.prisma's ProfessionalServiceOffering comment.
export const discoverProfessionalsQuerySchema = z.object({
  serviceType: z.enum(["fitness", "nutrition", "combined"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  // "Rating" and "Availability" sort pills from the design are dropped —
  // no rating/review system exists anywhere in this build, and a fixed
  // slot grid (see coaching.service.ts) has no meaningful "soonest
  // available" ranking across many professionals at once. Price and
  // Experience are the two real, server-computable sorts that remain.
  sort: z.enum(["price", "experience"]).optional().default("experience"),
});
export type DiscoverProfessionalsQuery = z.infer<typeof discoverProfessionalsQuerySchema>;

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const createBookingSchema = z.object({
  // Entity ids are `String @id @default(uuid())` — uuid is only the default
  // generator, not a DB constraint, and seed data uses readable ids
  // ("coach-alex-rivera"), so a strict `.uuid()` here rejected all seeded
  // coaches (found 31 Aug 2026, first run against a real DB). A non-empty
  // string is the right check for a String id column — a bad id 404s on the
  // parameterized lookup, no injection surface.
  professionalId: z.string().min(1).max(191),
  offeringId: z.string().min(1).max(191),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be an ISO 8601 date-time" }),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

// Matches the design's "reason-for-change radio list" — schedule
// conflicts / different specialization / other personal preferences.
export const createChangeRequestSchema = z.object({
  reason: z.enum(["schedule_conflict", "different_specialization", "other"]),
  note: z.string().trim().max(500).optional(),
});
export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;

// 16 Sep 2026 (gap §56) — the coach's own real accept/decline actions on a
// `requested` relationship. Decline's reason is an optional short free-text
// note (not the structured ChangeReasonCategory above — that's the USER's
// own reason for wanting a different coach on an already-`active`
// relationship, a different action entirely), defaulted server-side
// (coaching.service.ts's declineRelationship) when omitted.
export const declineRelationshipSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type DeclineRelationshipInput = z.infer<typeof declineRelationshipSchema>;
