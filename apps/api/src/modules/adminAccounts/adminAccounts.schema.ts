import { z } from "zod";

// Mirrors prisma/schema.prisma's AdminRole enum exactly (D15/D21 roles,
// Oct 2026). Only the Super Admin's changes to admin accounts apply
// directly; anyone else's become approval requests (adminPermissions.ts).
export const adminRoles = ["super_admin", "co_founder", "operations", "finance", "safety_privacy", "support"] as const;

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
