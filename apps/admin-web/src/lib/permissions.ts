import { useAuth } from "./auth";

/**
 * Role-aware console (Oct 2026). The signed-in admin carries its role's
 * grants (`permissions`, from login and /admin/auth/me — apps/api's
 * permissionsFor, the same matrix every route enforces). The console uses
 * them to hide menus, pages and buttons the role would only get "access
 * denied" on. It never grants anything: the server still checks every call.
 * Without `permissions` (an older session) everything shows, as before.
 */

export type AdminAction = "view" | "create" | "edit" | "delete" | "export" | "approve";
type Permissions = Partial<Record<string, string[]>> | undefined;

export function can(permissions: Permissions, module: string | undefined, action: AdminAction = "view"): boolean {
  if (!module || !permissions) return true;
  return (permissions[module] ?? []).includes(action);
}

/** `useCan("support", "edit")` — true when the signed-in role may do it. */
export function useCan(module: string, action: AdminAction): boolean {
  const { adminUser } = useAuth();
  return can(adminUser?.permissions, module, action);
}

/**
 * The module each page's data needs (the `requirePermission` on its API
 * routes), most specific path first. `null` = any signed-in admin (your own
 * Security page). Pages not listed fall back to their section.
 */
const PAGE_MODULES: [prefix: string, module: string | null][] = [
  ["/ai-operations/usage", "analytics"],
  ["/ai-operations/safety", "sensitiveData"],
  ["/ai-operations", "admin"],
  ["/admin-system/security", null],
  ["/admin-system/audit-logs", "auditLogs"],
  ["/admin-system/privacy-requests", "sensitiveData"],
  ["/admin-system/privacy", "sensitiveData"],
  ["/admin-system/consents", "sensitiveData"],
  ["/admin-system", "admin"],
  ["/action-required", "dashboard"],
  ["/approvals", "approvals"],
  ["/users", "users"],
  ["/professionals", "professionals"],
  ["/relationships", "relationships"],
  ["/programs", "programs"],
  ["/commerce", "commerce"],
  ["/finance", "commerce"],
  ["/growth", "growth"],
  ["/support", "support"],
  ["/analytics", "analytics"],
  ["/gyms", "gyms"],
];

export function moduleForPath(pathname: string): string | null {
  if (pathname === "/") return "dashboard";
  for (const [prefix, module] of PAGE_MODULES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return module;
  }
  return null;
}
