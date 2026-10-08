import { z } from "zod";
import { MIN_REASON_LENGTH } from "../../lib/highImpactAction";

export const createPrivacyRequestSchema = z.object({
  type: z.enum(["export", "deletion"]),
  /** Never required — a subject does not owe anyone a reason for a right. */
  userNote: z.string().trim().max(1000).optional(),
});
export type CreatePrivacyRequestInput = z.infer<typeof createPrivacyRequestSchema>;

/** Staff progress steps: a reason for the trail, but not high-impact. */
export const privacyStepSchema = z.object({
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(300),
});
export type PrivacyStepInput = z.infer<typeof privacyStepSchema>;

/**
 * Completing or rejecting a request is high-impact under BR-ADM-005:
 * completion destroys personal data irreversibly, and rejection denies
 * a statutory right. Both take the typed confirmation.
 */
export const privacyResolutionSchema = z.object({
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(300),
  confirmation: z.string().trim(),
  exportUrl: z.string().trim().url().max(2000).optional(),
});
export type PrivacyResolutionInput = z.infer<typeof privacyResolutionSchema>;

export const listPrivacyRequestsQuerySchema = z.object({
  status: z.enum(["received", "verifying", "in_progress", "completed", "rejected"]).optional(),
  type: z.enum(["export", "deletion"]).optional(),
});
export type ListPrivacyRequestsQuery = z.infer<typeof listPrivacyRequestsQuerySchema>;
