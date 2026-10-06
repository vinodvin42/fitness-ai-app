import { z } from "zod";

// Train 12 — GET /training/analytics?range=4w|12w|26w
export const analyticsQuerySchema = z.object({
  range: z.enum(["4w", "12w", "26w"]).default("12w"),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
