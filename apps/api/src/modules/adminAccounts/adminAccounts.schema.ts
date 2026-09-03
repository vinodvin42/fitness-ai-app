import { z } from "zod";

// Mirrors prisma/schema.prisma's AdminRole enum exactly — see
// adminAccounts.service.ts's own doc comment for why every value is
// assignable here. All 8 roles' permissions are enforced as of 25 Aug 2026
// (apps/api/src/middleware/adminPermissions.ts) — but the 7 non-super_admin
// matrices are still a derived starter set, not a confirmed spec (docs/
// admin/07-open-questions-gaps.md gap §7's 25 Aug update).
export const adminRoles = [
  "super_admin",
  "user_operations",
  "coach_operations",
  "finance",
  "content",
  "growth",
  "analytics",
  "support",
] as const;

export const adminUserStatuses = ["active", "disabled"] as const;

export const listAdminUsersQuerySchema = z.object({
  role: z.enum(adminRoles).optional(),
  status: z.enum(adminUserStatuses).optional(),
  search: z.string().trim().max(200).optional(),
});

// "Create Admin User" — the Figma's "Invite" relabeled (see
// adminAccounts.service.ts's doc comment for why). Deliberately no
// `password` field: the server always generates the temporary password
// itself, never accepts one from the client.
export const createAdminUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(adminRoles),
});

export type AdminRoleValue = (typeof adminRoles)[number];
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
