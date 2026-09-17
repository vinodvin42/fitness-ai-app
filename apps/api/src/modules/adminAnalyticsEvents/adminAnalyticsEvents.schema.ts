import { z } from "zod";

// U7 (15 Sep 2026) — the real read path for `AnalyticsEvent`, proving the
// events tracked by `apps/api/src/lib/trackEvent()` are genuinely
// inspectable rather than write-only into a void. Same "free-text search
// over a plain string column, not a fabricated dropdown of known values"
// reasoning as adminAuditLogs.schema.ts's own `search` field — `name`
// (domain.object.action) has no fixed, confirmable enum either; every new
// call site can introduce a new event name without a schema change here.
export const listAnalyticsEventsQuerySchema = z.object({
  name: z.string().trim().max(200).optional(),
  userId: z.string().trim().min(1).max(191).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type ListAnalyticsEventsQuery = z.infer<typeof listAnalyticsEventsQuerySchema>;
