import { z } from "zod";

// Train 12 — GET /training/analytics?range=1w|4w|8w|12w|26w|52w (Figma tabs 1W 1M 2M 6M 1Y; 12w kept for older clients)
export const analyticsQuerySchema = z.object({
  range: z.enum(["1w", "4w", "8w", "12w", "26w", "52w"]).default("12w"),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
