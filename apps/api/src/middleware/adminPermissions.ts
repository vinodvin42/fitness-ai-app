import { NextFunction, Response } from "express";
import { AdminAuthedRequest } from "./adminAuth";
import { ApiHttpError } from "./errorHandler";

/**
 * Real RBAC enforcement (25 Aug 2026, go-live prep). Until now,
 * `requireAdminAuth` only checked for *a* valid admin session — every
 * `AdminRole` was assignable in the UI, but none except `super_admin` was
 * ever actually gated (see adminAuth.ts's own doc comment, and
 * prisma/schema.prisma's AdminRole comment). This closes that gap.
 *
 * The module list and the six actions (View/Create/Edit/Delete/Export/
 * Approve) come from docs/admin/05-roles-permissions.md — the one place
 * this build has a real, design-sourced permission matrix. That doc is
 * explicit that only Super Admin's matrix was ever visible in the
 * reviewed Figma export; the other 7 roles' cell-level permissions were
 * "not visible in this static export" and the doc says to "capture their
 * matrices... before treating this as final."
 *
 * So PERMISSION_MATRIX below is two different kinds of data:
 *  - `super_admin`: copied directly from the doc's real matrix (with one
 *    deliberate extension — see the comment on `commerce` below).
 *  - every other role: a STARTER matrix I derived by taking each role's
 *    literal "stated scope" text from the same doc's role table (e.g.
 *    Finance = "Revenue, transactions, settlements") and granting that
 *    role the *same* action set super_admin has on the one matrix row
 *    whose name matches — nothing invented beyond that mapping. This is
 *    a defensible default, not a confirmed spec. Treat it as a draft to
 *    review against your actual staff roster before real accounts rely
 *    on it — see RUN-LOCALLY.md / the go-live plan for the request to
 *    send a real role list.
 */

export type AdminModule =
  | "dashboard"
  | "users"
  | "professionals"
  | "relationships"
  | "programs"
  | "commerce"
  | "growth"
  | "analytics"
  | "support"
  | "admin"
  | "sensitiveData"
  | "auditLogs"
  // Gym Partner Lite — R1 Wave 1 (added 20 Sep 2026). Its own module
  // rather than folded into `growth` — partner accounts/status/commercial
  // terms are closer to `professionals` (an external-party relationship
  // super_admin manages end to end) than a marketing/acquisition lever.
  | "gyms";

export type AdminAction = "view" | "create" | "edit" | "delete" | "export" | "approve";

type ModulePermissions = Partial<Record<AdminModule, AdminAction[]>>;

const ALL_ROLES = [
  "super_admin",
  "user_operations",
  "coach_operations",
  "finance",
  "content",
  "growth",
  "analytics",
  "support",
] as const;

type KnownAdminRole = (typeof ALL_ROLES)[number];

export const PERMISSION_MATRIX: Record<KnownAdminRole, ModulePermissions> = {
  // Copied directly from docs/admin/05-roles-permissions.md §2's Super
  // Admin matrix. One deliberate extension: the doc's `commerce` row
  // (view/export/approve only) pre-dates Module 06.05 — adminPlans.ts's
  // real create/edit/archive endpoints — so `create`/`edit` are added
  // here to match what super_admin has actually always been able to do
  // in this codebase; not adding them would be a real regression, not a
  // permissions tightening.
  super_admin: {
    dashboard: ["view", "create", "export"],
    users: ["view", "create", "edit", "delete", "export"],
    professionals: ["view", "create", "edit", "delete", "export", "approve"],
    relationships: ["view", "create", "edit", "delete", "export"],
    programs: ["view", "create", "edit", "delete", "export", "approve"],
    commerce: ["view", "create", "edit", "export", "approve"],
    growth: ["view", "create", "edit", "delete", "export"],
    analytics: ["view", "export"],
    support: ["view", "create", "edit", "export"],
    admin: ["view", "create", "edit", "delete", "export", "approve"],
    sensitiveData: ["view", "edit", "approve"],
    auditLogs: ["view", "export"],
    gyms: ["view", "create", "edit", "delete", "export", "approve"],
  },

  // "User management and support" — mirrors super_admin's users + support
  // rows exactly; nothing else (no Professionals/Commerce/Admin access).
  user_operations: {
    dashboard: ["view"],
    users: ["view", "create", "edit", "delete", "export"],
    support: ["view", "create", "edit", "export"],
  },

  // "Professional verification and management" — mirrors super_admin's
  // professionals row exactly. Relationships included too since a
  // Professional's active pairings are the natural extension of
  // "management" — the more debatable inference in this starter set,
  // worth confirming explicitly.
  coach_operations: {
    dashboard: ["view"],
    professionals: ["view", "create", "edit", "delete", "export", "approve"],
    relationships: ["view", "create", "edit", "delete", "export"],
  },

  // "Revenue, transactions, settlements" — mirrors super_admin's commerce
  // row exactly (including the create/edit extension noted above).
  finance: {
    dashboard: ["view"],
    commerce: ["view", "create", "edit", "export", "approve"],
  },

  // "Programs, exercises, content approval" — mirrors super_admin's
  // programs row exactly (adminPrograms.ts covers all three content
  // types — Programs/Exercises/Recipes — under this one module).
  content: {
    dashboard: ["view"],
    programs: ["view", "create", "edit", "delete", "export", "approve"],
  },

  // "Influencers, referrals, campaigns" — mirrors super_admin's growth
  // row exactly. Only Referrals (adminReferrals.ts) actually exists
  // behind this module today; Influencers/Campaigns have no backend yet.
  growth: {
    dashboard: ["view"],
    growth: ["view", "create", "edit", "delete", "export"],
  },

  // "Read-only analytics and reports" — mirrors super_admin's analytics
  // row exactly; the role's own name confirms no write access anywhere.
  analytics: {
    dashboard: ["view"],
    analytics: ["view", "export"],
  },

  // "Ticket management and user assistance" — mirrors super_admin's
  // support row exactly, plus read-only Users access for "...and user
  // assistance" (a support agent needs to look up who they're helping,
  // not edit their record).
  support: {
    dashboard: ["view"],
    support: ["view", "create", "edit", "export"],
    users: ["view"],
  },
};

function isKnownRole(role: string | undefined): role is KnownAdminRole {
  return !!role && (ALL_ROLES as readonly string[]).includes(role);
}

/**
 * The same grant check `requirePermission` uses, exposed directly for
 * services that need a conditional/partial gate WITHIN one already-
 * authorized endpoint rather than an all-or-nothing route guard — e.g.
 * adminUsers.service.ts's sensitive-data-access flow, where holding
 * `sensitiveData: view` is a precondition for one action (creating a
 * request) but the endpoint itself (GET /admin/users/:id) stays reachable
 * by any role with `users: view`, request or no request. An unrecognized
 * role is treated the same fail-closed way as `requirePermission`.
 */
export function hasPermission(role: string | undefined, module: AdminModule, action: AdminAction): boolean {
  if (!isKnownRole(role)) return false;
  const granted = PERMISSION_MATRIX[role]?.[module] ?? [];
  return granted.includes(action);
}

/**
 * Use after requireAdminAuth on any admin route that maps to a real
 * module/action. Routes with no real permission boundary yet (currently
 * just GET /admin/auth/me — a session self-check every admin needs
 * regardless of role) intentionally don't use this.
 */
export function requirePermission(module: AdminModule, action: AdminAction) {
  return function (req: AdminAuthedRequest, _res: Response, next: NextFunction) {
    const role = req.adminRole;

    if (!isKnownRole(role)) {
      // An AdminUser row can theoretically carry a role value outside the
      // 8 named ones only via a direct DB edit (the Zod schema + Prisma
      // enum both constrain creation) — fail closed rather than assume
      // access, same as an unrecognized role should always be treated.
      throw new ApiHttpError(403, "forbidden", "Your admin role is not recognized for this action");
    }

    if (!hasPermission(role, module, action)) {
      throw new ApiHttpError(
        403,
        "forbidden",
        `Your role (${role}) does not have "${action}" access to ${module}`,
      );
    }

    next();
  };
}
