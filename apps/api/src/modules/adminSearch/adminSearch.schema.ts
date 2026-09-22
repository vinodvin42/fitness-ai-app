import { z } from "zod";

/**
 * Global cross-entity admin search — R1 Wave 6 (22 Sep 2026). See
 * adminSearch.service.ts's own doc comment for the full scope decisions
 * (exact/prefix match only, which entity types, permission gating).
 */
export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});
export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;
