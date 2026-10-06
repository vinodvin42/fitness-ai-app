import { z } from "zod";

// Train 14 (running) / 15 (cycling) endurance tracker. Bounds are "sane
// human" limits: <= 48h, <= 1,000 km, speed/pace sanity checked server-side.
export const createActivitySchema = z.object({
  kind: z.enum(["run", "ride"]),
  startedAt: z.string().datetime({ message: "startedAt must be an ISO 8601 date-time" }),
  durationSeconds: z.number().int().min(10).max(172800),
  distanceMeters: z.number().int().min(10).max(1_000_000),
  avgPaceSecPerKm: z.number().int().min(60).max(3600).optional(),
  avgSpeedKmh: z.number().min(0.5).max(120).optional(),
  elevationGainM: z.number().int().min(0).max(20000).optional(),
  calories: z.number().int().min(0).max(30000).optional(),
  // Google-encoded polyline of the tracked route.
  routePolyline: z.string().max(200_000).optional(),
  source: z.enum(["manual", "tracked"]).default("manual"),
  notes: z.string().trim().max(500).optional(),
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const listActivitiesQuerySchema = z.object({
  kind: z.enum(["run", "ride"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

export const activitySummaryQuerySchema = z.object({
  kind: z.enum(["run", "ride"]).optional(),
  range: z.enum(["4w", "12w", "26w", "52w"]).default("12w"),
});
export type ActivitySummaryQuery = z.infer<typeof activitySummaryQuerySchema>;
