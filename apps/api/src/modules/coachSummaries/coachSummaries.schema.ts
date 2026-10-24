import { z } from "zod";

// Professional publishes the client-visible summary of a completed session.
export const publishSummarySchema = z.object({
  summaryText: z.string().trim().min(1).max(4000),
});
export type PublishSummaryInput = z.infer<typeof publishSummarySchema>;

// Figma coach/11 "How was your session?" (24 Oct 2026): private to the coach.
export const SESSION_RATING_TAGS = ["clear_guidance", "on_time", "useful_plan_changes", "good_listener"] as const;
export const rateSessionSchema = z.object({
  stars: z.number().int().min(1).max(5),
  tags: z.array(z.enum(SESSION_RATING_TAGS)).max(SESSION_RATING_TAGS.length).default([]),
  comment: z.string().trim().max(1000).optional(),
});
export type RateSessionInput = z.infer<typeof rateSessionSchema>;
