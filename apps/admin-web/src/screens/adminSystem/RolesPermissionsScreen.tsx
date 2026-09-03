import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminRoleDetailResponse, AdminRoleListResponse, AdminRoleName } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

const ACTIONS = ["view", "create", "edit", "delete", "export", "approve"] as const;
const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  users: "Users",
  professionals: "Professionals",
  relationships: "Relationships",
  programs: "Programs",
  commerce: "Commerce",
  growth: "Growth",
  analytics: "Analytics",
  support: "Support",
  admin: "Admin",
  sensitiveData: "Sensitive Data",
  auditLogs: "Audit Logs",
};
const MODULE_ORDER = Object.keys(MODULE_LABELS);

async function fetchRoles(): Promise<AdminRoleListResponse> {
  const res = await apiClient.get<AdminRoleListResponse>("/admin/roles");
  return res.data;
}

async function fetchRoleDetail(role: string): Promise<AdminRoleDetailResponse> {
  const res = await apiClient.get<AdminRoleDetailResponse>(`/admin/roles/${role}`);
  return res.data;
}

/**
 * 12.02 Roles & Permissions (docs/admin/03-screen-inventory.md §12.02,
 * "Role-Based Access Control (RBAC)"), added 26 Aug 2026 — read-only, per
 * the Figma's own disclaimer preserved verbatim below. See apps/api's
 * adminRoles.service.ts for the full design: real role cards (design-
 * sourced descriptions + live member counts) and a real permission
 * matrix straight from `PERMISSION_MATRIX`, the same constant every
 * request in this API is already gated by — this screen is the first UI
 * to actually read it. "Create New Role"/"Edit Role Schemas" aren't
 * built, since this build's RBAC is fixed in code, not admin-editable
 * data — see `NotAvailablePanel` below rather than disabled buttons that
 * would imply otherwise.
 */
export function RolesPermissionsScreen() {
  const [selectedRole, setSelectedRole] = useState<AdminRoleName | null>(null);

  const { data: roleList, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: fetchRoles,
  });

  const activeRole = selectedRole ?? roleList?.roles[0]?.role ?? null;

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["admin-role-detail", activeRole],
    queryFn: () => fetchRoleDetail(activeRole as string),
    enabled: !!activeRole,
  });

  return (
    <AppShell title="Roles & Permissions" subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load roles.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {roleList && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-2 lg:col-span-1">
              {roleList.roles.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => setSelectedRole(r.role)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    activeRole === r.role ? "border-accent bg-accent/10" : "border-border-subtle bg-surface hover:border-accent/40"
                  }`}
                >
                  <div className="text-sm font-medium text-text-primary">
                    {r.role
                      .split("_")
                      .map((w) => w[0].toUpperCase() + w.slice(1))
                      .join(" ")}
                  </div>
                  <div className="mt-0.5 text-xs text-text-secondary">{r.description}</div>
                  <div className="mt-1 text-[11px] text-text-dim">{r.memberCount} member{r.memberCount === 1 ? "" : "s"}</div>
                </button>
              ))}
              <NotAvailablePanel
                keys={roleList.notAvailable}
                subtitle="This build's RBAC is a fixed role enum + permission matrix, not admin-editable data — see adminRoles.service.ts."
              />
            </div>

            <div className="space-y-3 lg:col-span-2">
              {detailLoading && <p className="text-sm text-text-secondary">Loading role detail…</p>}
              {detail && (
                <>
                  <div className="rounded-lg border border-border-subtle bg-surface p-4">
                    <div className="mb-3 text-xs uppercase tracking-wide text-text-dim">Permission matrix</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                            <th className="px-3 py-2 font-normal">Module</th>
                            {ACTIONS.map((a) => (
                              <th key={a} className="px-3 py-2 text-center font-normal capitalize">
                                {a}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {MODULE_ORDER.map((mod) => {
                            const grants = detail.permissions[mod] ?? [];
                            return (
                              <tr key={mod} className="border-b border-border-subtle last:border-0">
                                <td className="px-3 py-2 text-text-primary">{MODULE_LABELS[mod]}</td>
                                {ACTIONS.map((a) => (
                                  <td key={a} className="px-3 py-2 text-center">
                                    {grants.includes(a) ? (
                                      <span className="text-accent">✓</span>
                                    ) : (
                                      <span className="text-text-dim">–</span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-[11px] italic text-text-dim">
                      "Permissions are enforced by backend. UI visibility is supplementary, not authoritative."
                    </p>
                  </div>

                  <div className="rounded-lg border border-border-subtle bg-surface p-4">
                    <div className="mb-2 text-xs uppercase tracking-wide text-text-dim">Members</div>
                    {detail.members.length === 0 ? (
                      <p className="text-xs text-text-dim">No admin accounts hold this role yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.members.map((m) => (
                          <li key={m.id} className="flex items-center justify-between text-sm">
                            <span className="text-text-primary">
                              {m.fullName} <span className="text-text-dim">· {m.email}</span>
                            </span>
                            <StatusBadge status={m.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
