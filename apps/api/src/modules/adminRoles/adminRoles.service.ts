import { AdminRole } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { PERMISSION_MATRIX, AdminModule, AdminAction } from "../../middleware/adminPermissions";

/**
 * 12.02 Roles & Permissions (docs/admin/03-screen-inventory.md §12.02,
 * "Role-Based Access Control (RBAC)"), added 26 Aug 2026 — read-only, per
 * the Figma's own footnote (preserved verbatim on the frontend): *"Permissions
 * are enforced by backend. UI visibility is supplementary, not authoritative."*
 *
 * This is a genuine "new lens on real data" screen, same precedent as
 * 09.01 Analytics and 10's Finance module — no new Prisma entity, because
 * roles here are a fixed `AdminRole` enum + the `PERMISSION_MATRIX` constant
 * `adminPermissions.ts` already enforces on every request, not admin-editable
 * data. This screen is the first UI to actually READ that matrix rather than
 * just being gated by it.
 *
 * **Real:** the 8 role cards (name + `docs/admin/05-roles-permissions.md`
 * §1's design-sourced "stated scope" text — the design copy itself, not
 * fabricated), each with a REAL member count (`AdminUser.count({where:
 * {role}})`, live, not the Figma's static sample numbers), and the selected
 * role's full permission matrix straight from `PERMISSION_MATRIX` plus a
 * real list of that role's member accounts.
 *
 * **Not built:** "Create New Role" and "Edit Role Schemas" — both would
 * require roles/permissions to be admin-editable DATA (a `Role` entity, a
 * dynamic permission-grant table), but this build's RBAC is intentionally
 * fixed in code (`AdminRole` enum + `PERMISSION_MATRIX`), enforced on every
 * request via `requirePermission()` — the same design choice that makes
 * `docs/admin/07-open-questions-gaps.md` gap §7's "other 7 roles' matrices
 * are a derived starter set, not confirmed" caveat still apply here
 * verbatim. Building fake Create/Edit actions over a hardcoded matrix would
 * misrepresent it as configurable when it isn't — both actions are simply
 * absent from this screen rather than rendered disabled.
 */

const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: "Full system access",
  user_operations: "User management and support",
  coach_operations: "Professional verification and management",
  finance: "Revenue, transactions, settlements",
  content: "Programs, exercises, content approval",
  growth: "Influencers, referrals, campaigns",
  analytics: "Read-only analytics and reports",
  support: "Ticket management and user assistance",
};

const ROLE_ORDER = [
  "super_admin",
  "user_operations",
  "coach_operations",
  "finance",
  "content",
  "growth",
  "analytics",
  "support",
] as const;

export async function listRoles() {
  // 31 Aug 2026 (first real Prisma client generation): orderBy is required
  // by groupBy's typing when an aggregate is present, and the old result
  // cast broke overload inference — the inferred return already has this
  // shape, so it's dropped.
  const counts = await prisma.adminUser.groupBy({
    by: ["role"],
    _count: { _all: true },
    orderBy: { role: "asc" },
  });
  const countByRole = new Map(counts.map((c) => [c.role, c._count._all]));

  return {
    roles: ROLE_ORDER.map((role) => ({
      role,
      description: ROLE_DESCRIPTIONS[role],
      memberCount: countByRole.get(role) ?? 0,
    })),
    // "Create New Role" / "Edit Role Schemas" — see this file's top
    // comment for why neither is buildable over a code-fixed matrix.
    notAvailable: ["createRole", "editRoleSchemas"],
  };
}

export async function getRoleDetail(role: string) {
  if (!(ROLE_ORDER as readonly string[]).includes(role)) {
    return null;
  }

  const permissions = PERMISSION_MATRIX[role as keyof typeof PERMISSION_MATRIX] as Partial<Record<AdminModule, AdminAction[]>>;
  const members = (await prisma.adminUser.findMany({
    // `role` is validated against ROLE_ORDER above, so this cast to the
    // generated AdminRole enum is safe (surfaced 31 Aug 2026 on first real
    // client generation — a plain string isn't the enum type).
    where: { role: role as AdminRole },
    select: { id: true, fullName: true, email: true, status: true, lastLoginAt: true },
    orderBy: { fullName: "asc" },
  })) as Array<{ id: string; fullName: string; email: string; status: string; lastLoginAt: Date | null }>;

  return {
    role,
    description: ROLE_DESCRIPTIONS[role],
    permissions,
    members: members.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      status: m.status,
      lastLoginAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : null,
    })),
  };
}
