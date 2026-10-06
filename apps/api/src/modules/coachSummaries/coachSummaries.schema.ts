import { z } from "zod";

// Professional publishes the client-visible summary of a completed session.
export const publishSummarySchema = z.object({
  summaryText: z.string().trim().min(1).max(4000),
});
export type PublishSummaryInput = z.infer<typeof publishSummarySchema>;
