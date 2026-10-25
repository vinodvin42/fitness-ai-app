import { z } from "zod";

// GET /professionals/me/alerts. `bookingsSince` is the `asOf` of an earlier
// read, which the coach app keeps as its "seen up to" mark.
export const alertsQuerySchema = z.object({
  bookingsSince: z.string().datetime({ message: "bookingsSince must be an ISO 8601 date-time" }).optional(),
});
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;
