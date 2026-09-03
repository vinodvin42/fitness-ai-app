import { z } from "zod";

// docs/admin/03-screen-inventory.md 02.01's filter bar — Country, Status,
// Plan, Acquisition Channel, Date range. Country isn't included here:
// `User.countryCode` (added 26 Aug 2026 for Geographic Analytics) has no
// curated list to filter against server-side — see adminAnalytics's own
// Geographic notes for why. Status IS real now (26 Aug 2026, Module
// 02.01 bulk-select/suspend) — see this module's service file for the
// full real-vs-not breakdown. "Plan", "Status", and a createdAt date
// range are real filters.
export const membershipTiers = ["basic", "pro", "elite", "free"] as const;
export const userAccountStatuses = ["active", "suspended"] as const;

export const listUsersQuerySchema = z.object({
  plan: z.enum(membershipTiers).optional(),
  status: z.enum(userAccountStatuses).optional(),
  search: z.string().trim().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type MembershipTier = (typeof membershipTiers)[number];
export type UserAccountStatus = (typeof userAccountStatuses)[number];
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// Module 02.01 Bulk-select + suspend/reactivate (added 26 Aug 2026) —
// mirrors adminProfessionals.schema.ts's suspendProfessionalSchema
// exactly. No separate reactivate schema — reactivate takes no body,
// same precedent as reactivateProfessional.
export const suspendUserSchema = z.object({
  adminNotes: z.string().trim().max(2000).optional(),
});

export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

// Sensitive Data Access Requests (02.02's locked panel), added 25 Aug
// 2026 — see adminUsers.service.ts's sensitiveAccess functions and
// prisma/schema.prisma's SensitiveDataAccessRequest model for the full
// design. `reason` has a real minimum length since this is a logged
// justification a supervisor reviews, not a free checkbox — long enough
// to require an actual sentence, short enough not to demand an essay.
export const createSensitiveAccessRequestSchema = z.object({
  reason: z.string().trim().min(10, "Explain why you need access (at least 10 characters)").max(500),
});

export const reviewSensitiveAccessRequestSchema = z.object({
  reviewNotes: z.string().trim().max(500).optional(),
});

export type CreateSensitiveAccessRequestInput = z.infer<typeof createSensitiveAccessRequestSchema>;
export type ReviewSensitiveAccessRequestInput = z.infer<typeof reviewSensitiveAccessRequestSchema>;
