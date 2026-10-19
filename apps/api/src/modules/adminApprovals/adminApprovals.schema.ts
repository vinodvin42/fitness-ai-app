import { z } from "zod";

export const approvalStatuses = [
  "pending",
  "applying",
  "approved",
  "rejected",
  "changes_requested",
  "expired",
  "failed",
  "cancelled",
] as const;

export const listApprovalsQuerySchema = z.object({
  status: z.enum(approvalStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;

export const decideApprovalSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export const requestChangesSchema = z.object({
  note: z.string().trim().min(3).max(2000),
});
