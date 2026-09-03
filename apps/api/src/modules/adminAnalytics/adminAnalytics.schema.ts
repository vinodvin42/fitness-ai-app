import { z } from "zod";

// 09.01 User Analytics (docs/admin/03-screen-inventory.md §09.01) — a
// date range for the KPI/trend/time-series section. Defaults to the last
// 30 days server-side when omitted — see adminAnalytics.service.ts. The
// Retention Cohort table deliberately does NOT take this range; it has
// its own fixed 6-calendar-month window — see that file's doc comment
// for why.
export const getUserAnalyticsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type GetUserAnalyticsQuery = z.infer<typeof getUserAnalyticsQuerySchema>;
