import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminAccountDirectoryResponse,
  AdminRole,
  CreateAdminUserInput,
  CreateAdminUserResult,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { useAuth } from "../../lib/auth";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

const ROLE_OPTIONS: AdminRole[] = [
  "super_admin",
  "user_operations",
  "coach_operations",
  "finance",
  "content",
  "growth",
  "analytics",
  "support",
];

function roleLabel(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Filters {
  role: AdminRole | "";
  status: "active" | "disabled" | "";
  search: string;
}

async function fetchDirectory(filters: Filters): Promise<AdminAccountDirectoryResponse> {
  const res = await apiClient.get<AdminAccountDirectoryResponse>("/admin/admin-users", {
    params: {
      role: filters.role || undefined,
      status: filters.status || undefined,
      search: filters.search || undefined,
    },
  });
  return res.data;
}

const EMPTY_FORM: CreateAdminUserInput = { email: "", fullName: "", role: "support" };

/**
 * 12.01 Admin Users (docs/admin/03-screen-inventory.md §12.01) — the admin
 * console managing its own staff accounts, added 22 Aug 2026. Closes the
 * gap adminAuth.service.ts's own doc comment flagged: AdminUser accounts
 * were seed-script-only until now. See apps/api's adminAccounts.service.ts
 * for the full real-vs-not breakdown; the two things worth flagging here
 * specifically:
 * - "Create Admin User" replaces the Figma's "Invite" (no email/SMTP
 *   infrastructure anywhere in this build) — on success it reveals the
 *   generated temporary password ONCE, in this same panel, for the
 *   creating admin to copy and relay out-of-band. Closing the panel or
 *   navigating away loses it for good, same as the backend never storing
 *   it in plaintext.
 * - Disable is blocked client-side (in addition to the real 400
 *   `cannot_disable_self` the backend enforces either way) for whichever
 *   row matches the signed-in admin's own id — see useAuth()'s
 *   adminUser.id below.
 *
 * Single Directory-style screen, no detail drill-down (the Figma's 12.01
 * has none), no role-change-after-creation action, no pagination (small
 * internal-staff dataset expected — same "UI chrome, not a data field"
 * precedent as the bulk-select checkboxes every other Directory screen
 * also omits).
 *
 * **22 Aug 2026:** now shares `ADMIN_SYSTEM_SUB_NAV` with 12.03 Audit
 * Logs, the module's second real screen — see that file's own doc
 * comment for why this triggered the same "subNav appears once a module
 * ships more than one screen" transition Professionals/Programs went
 * through earlier.
 */
export function AdminUsersScreen() {
  const { t } = useTranslation();
  const { adminUser: viewer } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ role: "", status: "", search: "" });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<CreateAdminUserInput>(EMPTY_FORM);
  const [createdResult, setCreatedResult] = useState<CreateAdminUserResult | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-accounts", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });

  const createMutation = useMutation({
    mutationFn: (input: CreateAdminUserInput) =>
      apiClient.post<CreateAdminUserResult>("/admin/admin-users", input).then((res) => res.data),
    onSuccess: (result) => {
      setCreatedResult(result);
      setForm(EMPTY_FORM);
      setCopyConfirmed(false);
      invalidateAll();
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/admin-users/${id}/disable`),
    onSuccess: invalidateAll,
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/admin-users/${id}/enable`),
    onSuccess: invalidateAll,
  });

  async function copyPassword() {
    if (!createdResult) return;
    try {
      await navigator.clipboard.writeText(createdResult.temporaryPassword);
      setCopyConfirmed(true);
    } catch {
      // Clipboard permission can be denied by the browser — the password
      // stays visible and select-all in the panel either way.
    }
  }

  function closeCreatedPanel() {
    setCreatedResult(null);
    setShowCreateForm(false);
    setCopyConfirmed(false);
  }

  return (
    <AppShell title={t("adminUsers.adminUsers")} subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t("adminUsers.totalAdmins")} value={data.counts.total} />
            <StatCard label={t("adminUsers.active")} value={data.counts.active} />
            <StatCard label={t("adminUsers.disabled")} value={data.counts.disabled} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("adminUsers.role")}
            <select
              value={filters.role}
              onChange={(e) => setFilter("role", e.target.value as Filters["role"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("adminUsers.all")}</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("adminUsers.status")}
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("adminUsers.all")}</option>
              <option value="active">{t("adminUsers.active")}</option>
              <option value="disabled">{t("adminUsers.disabled")}</option>
            </select>
          </label>

          <label className="ml-0 flex flex-col gap-1 text-xs text-text-dim">
            {t("adminUsers.search")}
            <input
              type="search"
              placeholder={t("adminUsers.nameOrEmail")}
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-56 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showCreateForm ? "Cancel" : "+ Create Admin User"}
          </button>
        </div>

        {showCreateForm && !createdResult && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
            className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4"
          >
            <div className="text-sm font-medium">{t("adminUsers.createAdminUser")}</div>
            <p className="text-xs text-text-secondary">
              Relabeled from the Figma's "Invite" — there's no email/SMTP infrastructure in this build to send
              one. A temporary password is generated here and shown once for you to relay directly.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("adminUsers.fullName")}
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("adminUsers.email")}
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("adminUsers.role")}
                <select
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as AdminRole }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {form.role !== "super_admin" && (
              <p className="text-[11px] text-text-dim">
                This role's permissions are enforced (see
                apps/api/src/middleware/adminPermissions.ts), but they're a starter matrix derived
                from role descriptions, not a confirmed spec — see docs/admin/07-open-questions-gaps.md
                gap §7. Review the grants before relying on them for a real hire.
              </p>
            )}
            {createMutation.isError && (
              <p className="text-xs text-danger">
                {extractErrorMessage(createMutation.error, "Couldn't create this admin account.")}
              </p>
            )}
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {createMutation.isPending ? "Creating…" : "Create Admin User"}
            </button>
          </form>
        )}

        {createdResult && (
          <div className="space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-4">
            <div className="text-sm font-medium text-accent">{t("adminUsers.adminAccountCreated")}</div>
            <p className="text-xs text-text-secondary">
              {createdResult.adminUser.fullName} ({createdResult.adminUser.email}) can sign in with the temporary
              password below. This is shown once — it is not stored in plaintext and cannot be retrieved again.
              Relay it to them directly.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface px-3 py-2">
              <code className="flex-1 select-all text-sm text-text-primary">{createdResult.temporaryPassword}</code>
              <button
                type="button"
                onClick={copyPassword}
                className="rounded-md border border-border-subtle px-2 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
              >
                {copyConfirmed ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              onClick={closeCreatedPanel}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
            >
              {t("adminUsers.done")}
            </button>
          </div>
        )}

        {isLoading && <p className="text-sm text-text-secondary">{t("adminUsers.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load admin users.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("adminUsers.retry")}
            </button>
          </div>
        )}

        {(disableMutation.isError || enableMutation.isError) && (
          <p className="text-xs text-danger">
            {extractErrorMessage(disableMutation.error ?? enableMutation.error, "That action didn't go through.")}
          </p>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">{t("adminUsers.nameEmail")}</th>
                  <th className="px-4 py-3 font-normal">{t("adminUsers.role")}</th>
                  <th className="px-4 py-3 font-normal">{t("adminUsers.status")}</th>
                  <th className="px-4 py-3 font-normal">{t("adminUsers.lastLogin")}</th>
                  <th className="px-4 py-3 font-normal">{t("adminUsers.created")}</th>
                  <th className="px-4 py-3 font-normal">{t("adminUsers.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.adminUsers.map((a) => {
                  const isSelf = a.id === viewer?.id;
                  return (
                    <tr key={a.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">
                          {a.fullName}
                          {isSelf && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-text-dim">{t("adminUsers.you")}</span>
                          )}
                        </div>
                        <div className="text-xs text-text-dim">{a.email}</div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{roleLabel(a.role)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {a.status === "active" ? (
                          <button
                            type="button"
                            disabled={isSelf || disableMutation.isPending}
                            title={isSelf ? "You cannot disable your own account" : undefined}
                            onClick={() => disableMutation.mutate(a.id)}
                            className="rounded-md border border-danger/40 px-2.5 py-1 text-xs text-danger disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t("adminUsers.disable")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={enableMutation.isPending}
                            onClick={() => enableMutation.mutate(a.id)}
                            className="rounded-md border border-accent/40 px-2.5 py-1 text-xs text-accent disabled:opacity-40"
                          >
                            {t("adminUsers.enable")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data.adminUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-dim">
                      {t("adminUsers.noAdminUsersMatch")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
