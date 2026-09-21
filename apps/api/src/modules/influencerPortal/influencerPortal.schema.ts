import { z } from "zod";

/**
 * Creator Portal self-service (R2 Wave 5, 21 Sep 2026) — every route in
 * this module is `requireInfluencerAuth`, scoped to the caller's own
 * `req.influencerId`. Only the report's optional date range is ever
 * client-supplied — same shape as adminAcquisition.schema.ts's own
 * `getAcquisitionReportQuerySchema`, reused rather than redefined.
 */
export const getInfluencerAcquisitionReportQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
export type GetInfluencerAcquisitionReportQuery = z.infer<typeof getInfluencerAcquisitionReportQuerySchema>;
