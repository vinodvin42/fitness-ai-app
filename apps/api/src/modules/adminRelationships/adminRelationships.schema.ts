import { z } from "zod";

// docs/admin/03-screen-inventory.md 04.01's filter bar — Service type,
// Status, Country, Date range picker. "Country" is deliberately not a
// filter here: no country/region field exists anywhere on `User` (see
// this module's `notAvailable` list) — there is nothing to filter by.
// Real filters only: serviceType/status/search plus a createdAt date
// range. These are genuine query filters, not a tab strip like Module
// 03's Directory — the Figma spec itself describes 04.01 as "Filters",
// not "Tabs", and `RelationshipStatus` only has two values (active/ended)
// so a tab-per-status strip would be redundant with a plain dropdown.
export const listRelationshipsQuerySchema = z.object({
  serviceType: z.enum(["fitness", "nutrition"]).optional(),
  status: z.enum(["active", "ended"]).optional(),
  search: z.string().trim().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// Ending a pairing needs no new entity: `Relationship.status` already has
// a real "ended" value — this is the one real state-changing action
// 04.02 ships directly (plus its reverse, reactivate). 04.03's
// reassignment action lives in the Change/Intervention Queue schemas
// below instead, once the `RelationshipChangeRequest` entity existed to
// back it (25 Aug 2026, see adminRelationships.service.ts's top comment).
export const endRelationshipSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});

// 04.03 Change/Intervention Queue, added 25 Aug 2026 — see
// adminRelationships.service.ts's top comment for the full design,
// including why `status` filter has no "denied" option (the schema's
// `RelationshipChangeStatus` enum uses "rejected").
export const listChangeRequestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

export const reviewChangeRequestSchema = z.object({
  reviewNotes: z.string().trim().max(2000).optional(),
});

export type ListRelationshipsQuery = z.infer<typeof listRelationshipsQuerySchema>;
export type EndRelationshipInput = z.infer<typeof endRelationshipSchema>;
export type ListChangeRequestsQuery = z.infer<typeof listChangeRequestsQuerySchema>;
export type ReviewChangeRequestInput = z.infer<typeof reviewChangeRequestSchema>;
