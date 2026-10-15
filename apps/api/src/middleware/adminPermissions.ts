import { NextFunction, Response } from "express";
import { AdminAuthedRequest } from "./adminAuth";
import { ApiHttpError } from "./errorHandler";
import { captureForApproval, isApprovalReplay, runWithChangeContext } from "../lib/makerChecker";

/**
 * Admin RBAC + maker-checker (FynroX blueprint section 5, decision D21,
 * Oct 2026).
 *
 * Roles (D15/D21): Lakshman is the only Super Admin and his changes apply
 * directly (a reason is recorded in the audit log). The co-founder can see
 * everything but every change he makes is a request. Operations, Finance,
 * Safety & Privacy and Support do their day-to-day work directly, but
 * risky changes (money, prices, fees, commissions, codes, offers, payouts,
 * refunds, settings, partner and account actions) become approval
 * requests that only the Super Admin can approve. Nobody approves their
 * own change. See lib/makerChecker.ts and modules/adminApprovals.
 *
 * Old roles were migrated in 20261015110000_admin_roles_mfa_approvals:
 * user_operations / coach_operations / content / growth / analytics ->
 * operations; finance, support and super_admin unchanged.
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
  | "gyms"
  // Maker-checker approvals inbox (D21).
  | "approvals";

export type AdminAction = "view" | "create" | "edit" | "delete" | "export" | "approve";

type ModulePermissions = Partial<Record<AdminModule, AdminAction[]>>;

const ALL_ROLES = ["super_admin", "co_founder", "operations", "finance", "safety_privacy", "support"] as const;

export type KnownAdminRole = (typeof ALL_ROLES)[number];

const ALL_MODULES: AdminModule[] = [
  "dashboard",
  "users",
  "professionals",
  "relationships",
  "programs",
  "commerce",
  "growth",
  "analytics",
  "support",
  "admin",
  "sensitiveData",
  "auditLogs",
  "gyms",
  "approvals",
];

const FULL: AdminAction[] = ["view", "create", "edit", "delete", "export", "approve"];

export const PERMISSION_MATRIX: Record<KnownAdminRole, ModulePermissions> = {
  // Lakshman (Super Admin): everything, applied directly.
  super_admin: {
    dashboard: ["view", "create", "edit", "export"],
    users: ["view", "create", "edit", "delete", "export"],
    professionals: FULL,
    relationships: ["view", "create", "edit", "delete", "export"],
    programs: FULL,
    commerce: ["view", "create", "edit", "export", "approve"],
    growth: ["view", "create", "edit", "delete", "export"],
    analytics: ["view", "export"],
    support: ["view", "create", "edit", "export"],
    admin: FULL,
    sensitiveData: ["view", "edit", "approve"],
    auditLogs: ["view", "export"],
    gyms: FULL,
    approvals: ["view", "approve"],
  },

  // Co-founder: views everything; every write becomes a request to
  // Lakshman (see needsApproval). Never approves anything.
  co_founder: {
    ...Object.fromEntries(ALL_MODULES.map((m) => [m, ["view", "export"] as AdminAction[]])),
    users: ["view", "edit", "export"],
    professionals: ["view", "create", "edit", "export", "approve"],
    relationships: ["view", "edit", "export"],
    programs: ["view", "create", "edit", "export", "approve"],
    commerce: ["view", "create", "edit", "export", "approve"],
    growth: ["view", "create", "edit", "export"],
    gyms: ["view", "create", "edit", "export", "approve"],
    admin: ["view", "create", "edit", "export"],
    approvals: ["view", "create"],
  },

  // Maya Rao (Operations): users, professionals, relationships, content,
  // gyms, partners/growth and analytics.
  operations: {
    dashboard: ["view", "edit"],
    users: ["view", "create", "edit", "export"],
    professionals: ["view", "create", "edit", "export", "approve"],
    relationships: ["view", "create", "edit", "export"],
    programs: FULL,
    growth: ["view", "create", "edit", "export"],
    gyms: ["view", "create", "edit", "export", "approve"],
    analytics: ["view", "export"],
    approvals: ["view", "create"],
  },

  // Kiran (Finance): revenue, refunds, settlements, payout runs.
  finance: {
    dashboard: ["view"],
    commerce: ["view", "create", "edit", "export", "approve"],
    analytics: ["view", "export"],
    approvals: ["view", "create"],
  },

  // Farah Ali (Safety & Privacy): safety escalations, privacy requests,
  // health-data access reviews, audit log.
  safety_privacy: {
    dashboard: ["view"],
    users: ["view", "edit"],
    support: ["view", "create", "edit", "export"],
    sensitiveData: ["view", "edit", "approve"],
    auditLogs: ["view", "export"],
    approvals: ["view", "create"],
  },

  // Anil (Support): tickets and user lookup.
  support: {
    dashboard: ["view"],
    support: ["view", "create", "edit", "export"],
    users: ["view"],
    approvals: ["view", "create"],
  },
};

/**
 * Modules where a write by anyone other than the Super Admin must be
 * approved by the Super Admin (D21: money, prices, fees, commissions,
 * codes, offers, payouts, refunds, settings, partner and account actions).
 * Day-to-day modules (dashboard queue, support tickets, programs content,
 * the existing two-person health-data review) are not listed; a single
 * route can still opt in or out with `requirePermission(..., { approval })`.
 */
const APPROVAL_MODULES: ReadonlySet<AdminModule> = new Set<AdminModule>([
  "users",
  "professionals",
  "relationships",
  "commerce",
  "growth",
  "admin",
  "gyms",
]);

const WRITE_ACTIONS: ReadonlySet<AdminAction> = new Set<AdminAction>(["create", "edit", "delete", "approve"]);

export type ApprovalPolicy = "default" | "required" | "exempt";

/** True when this role's write must go to the Super Admin as an approval request instead of applying. */
export function needsApproval(
  role: string | undefined,
  module: AdminModule,
  action: AdminAction,
  policy: ApprovalPolicy = "default",
): boolean {
  if (role === "super_admin") return false;
  if (!WRITE_ACTIONS.has(action)) return false;
  if (role === "co_founder") return true;
  if (policy === "required") return true;
  if (policy === "exempt") return false;
  return APPROVAL_MODULES.has(module);
}

export function isSuperAdmin(role: string | undefined): boolean {
  return role === "super_admin";
}

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
 * module/action. For a write that needs the Super Admin's approval (see
 * needsApproval), the request is saved as an ApprovalRequest and answered
 * with 202 instead of being applied; when the Super Admin approves it, the
 * same route runs again for the maker (lib/makerChecker.ts) and this check
 * lets it through. Every write runs inside a change context so the audit
 * log records the reason and, for approved requests, the checker.
 */
export function requirePermission(module: AdminModule, action: AdminAction, opts: { approval?: ApprovalPolicy } = {}) {
  return function (req: AdminAuthedRequest, res: Response, next: NextFunction) {
    const role = req.adminRole;

    if (!isKnownRole(role)) {
      throw new ApiHttpError(403, "forbidden", "Your admin role is not recognized for this action");
    }

    if (!hasPermission(role, module, action)) {
      throw new ApiHttpError(
        403,
        "forbidden",
        `Your role (${role}) does not have "${action}" access to ${module}`,
      );
    }

    if (!WRITE_ACTIONS.has(action)) {
      next();
      return;
    }

    if (!isApprovalReplay(req) && needsApproval(role, module, action, opts.approval)) {
      captureForApproval(req, res, { module, action }).catch(next);
      return;
    }

    runWithChangeContext(req, next);
  };
}
