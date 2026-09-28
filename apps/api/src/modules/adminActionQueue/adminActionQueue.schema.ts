import { z } from "zod";

// `AdminActionItem`'s real enums (prisma/schema.prisma) — see that
// model's own doc comment and lib/adminActionQueue.ts's top comment for
// the full design.
export const adminActionItemTypes = [
  "entitlement_activation_failed",
  "professional_assignment_pending",
  "gym_help_request",
  "professional_acceptance_stalled",
  "relationship_activation_failed",
  "credential_expiring",
  "payout_failed",
  "refund_impact",
  "chargeback",
  "safety_escalation",
  "privacy_request",
  "professional_complaint",
  "partner_abuse_review",
  "access_revocation_failed",
  "support_ticket_open",
  "support_escalation",
  "relationship_change_pending",
  "credential_verification_pending",
] as const;

export const adminActionItemSeverities = ["low", "medium", "high"] as const;
export const adminActionItemStatuses = ["open", "resolved"] as const;

// Minimal, filterable read side per this wave's own scope — a real
// dashboard UI (sorting/pagination/etc.) is Wave 4's own unit.
export const listActionItemsQuerySchema = z.object({
  type: z.enum(adminActionItemTypes).optional(),
  severity: z.enum(adminActionItemSeverities).optional(),
  status: z.enum(adminActionItemStatuses).optional(),
  assignedToAdminId: z.string().min(1).max(191).optional(),
});

export const assignActionItemSchema = z.object({
  adminId: z.string().min(1).max(191),
});

export const resolveActionItemSchema = z.object({
  resolutionNote: z.string().trim().max(2000).optional(),
});

export type ListActionItemsQuery = z.infer<typeof listActionItemsQuerySchema>;
export type AssignActionItemInput = z.infer<typeof assignActionItemSchema>;
export type ResolveActionItemInput = z.infer<typeof resolveActionItemSchema>;
