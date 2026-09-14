import { z } from "zod";

// Plan-Generation / Recommendation Engine (14 Sep 2026) — see
// plans.service.ts's doc comment for the full design reasoning.

/** Body for POST /recommendations/:id/decide. */
export const decideRecommendationSchema = z
  .object({
    action: z.enum(["accept", "decline", "modify"]),
    // Only meaningful (and required) when action is "modify" — a
    // professional (or, self-serve, the user) overriding the AI's
    // suggestion with a different real Program rather than accepting or
    // declining it outright. String id, not `.uuid()` — seed Programs use
    // readable ids ("prog-..."), same convention as every other
    // string-id schema in this codebase (see coaching.schema.ts's own
    // comment on why).
    replacementProgramId: z.string().min(1).max(191).optional(),
  })
  .refine((v) => v.action !== "modify" || Boolean(v.replacementProgramId), {
    message: "replacementProgramId is required when action is \"modify\"",
    path: ["replacementProgramId"],
  });
export type DecideRecommendationInput = z.infer<typeof decideRecommendationSchema>;
