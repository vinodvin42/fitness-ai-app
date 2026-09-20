import { z } from "zod";

// R2 Wave 1 (20 Sep 2026) — professionalLifecycle.service.ts's own doc
// comment has the full "why this module exists separately from
// professionalOnboarding/adminProfessionals" reasoning.
//
// A flat cap on the count of currently-`active` Relationship rows for one
// professional (no calendar-slot capacity model this wave). 1–500 is a
// sanity bound, not a spec'd business limit — the default is 15
// (schema.prisma's `Professional.maxActiveClients`).
export const updateMaxActiveClientsSchema = z.object({
  maxActiveClients: z.coerce.number().int().min(1).max(500),
});

export type UpdateMaxActiveClientsInput = z.infer<typeof updateMaxActiveClientsSchema>;
