import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminUserDirectoryResponse, MembershipTier, UserAccountStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";

const MEMBERSHIP_LABELS: Record<MembershipTier, string> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  elite: "Elite",
};

const CHANNEL_LABELS: Record<string, string> = { referral: "Referral", organic: "Organic" };

interface Filters {
  plan: MembershipTier | "";
  status: UserAccountStatus | "";
  search: string;
  startDate: string;
  endDate: string;
}

async function fetchDirectory(filters: Filters): Promise<AdminUserDirectoryResponse> {
  const res = await apiClient.get<AdminUserDirectoryResponse>("/admin/users", {
    params: {
      plan: filters.plan || undefined,
      status: filters.status || undefined,
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    },
  });
  return res.data;
}

/** One user's real suspend/reactivate call — see bulkAction below for why this is N real per-row calls, not one atomic bulk endpoint. */
function suspendOne(id: string) {
  return apiClient.post(`/admin/users/${id}/suspend`, {});
}
function reactivateOne(id: string) {
  return apiClient.post(`/admin/users/${id}/reactivate`);
}

/**
 * 02.01 User Directory (docs/admin/03-screen-inventory.md §02) — the
 * first real screen in Module 02, added 21 Aug 2026. Real filters (Plan,
 * a `createdAt` date range, and a name/email search) against the `User`
 * model, plus — added 26 Aug 2026 — a real Status filter/column and a
 * real checkbox/bulk-action bar. See apps/api's adminUsers.service.ts for
 * exactly which Figma-spec'd columns/filters (Region, Last Sync, Country)
 * still have no backing field and are surfaced via `NotAvailablePanel`
 * below rather than faked.
 *
 * Bulk-select was intentionally NOT built until now — this build had no
 * bulk-action business logic for a checkbox to actually drive, and
 * `User` had no status field a bulk action could even flip. Re-checked
 * 26 Aug 2026 against build-plan.html's own suggested "smallest,
 * defensible first cut" (suspend/reactivate, mirroring the exact
 * pattern already shipped for `Professional`/`AdminUser`) — that turned
 * out to be buildable without a new product decision, since it's
 * account-operations, not a moderation/trust-and-safety policy call (see
 * adminUsers.service.ts's top comment). "Bulk action bar" here fires one
 * real `POST /admin/users/:id/suspend` or `/reactivate` call per
 * selected row via `Promise.allSettled` — not a single new atomic bulk
 * endpoint — so a partial failure (e.g. one row 404s mid-batch) is
 * reported per-row rather than silently rolled back or silently ignored.
 */
export function UserDirectoryScreen() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({ plan: "", status: "", search: "", startDate: "", endDate: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-users", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const users = useMemo(() => data?.users ?? [], [data]);

  const bulkMutation = useMutation({
    mutationFn: async (action: "suspend" | "reactivate") => {
      const ids = Array.from(selected);
      const results = await Promise.allSettled(ids.map((id) => (action === "suspend" ? suspendOne(id) : reactivateOne(id))));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: ids.length, failed };
    },
    onSuccess: ({ failed, total }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSelected(new Set());
      setBulkError(failed > 0 ? `${failed} of ${total} selected users couldn't be updated — try again for those.` : null);
    },
  });

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected = users.length > 0 && users.every((u) => selected.has(u.id));
  const toggleAllOnPage = () =>
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        users.forEach((u) => next.delete(u.id));
        return next;
      }
      const next = new Set(prev);
      users.forEach((u) => next.add(u.id));
      return next;
    });

  return (
    <AppShell title={t("userDirectory.userDirectory")}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("userDirectory.plan")}
            <select
              value={filters.plan}
              onChange={(e) => setFilter("plan", e.target.value as Filters["plan"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("userDirectory.all")}</option>
              <option value="free">{t("userDirectory.free")}</option>
              <option value="basic">{t("userDirectory.basic")}</option>
              <option value="pro">{t("userDirectory.pro")}</option>
              <option value="elite">{t("userDirectory.elite")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("userDirectory.status")}
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("userDirectory.all")}</option>
              <option value="active">{t("userDirectory.active")}</option>
              <option value="suspended">{t("userDirectory.suspended")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("userDirectory.registeredFrom")}
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter("startDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("userDirectory.registeredTo")}
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilter("endDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <label className="ml-auto flex flex-col gap-1 text-xs text-text-dim">
            {t("userDirectory.search")}
            <input
              type="search"
              placeholder={t("userDirectory.nameOrEmail")}
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-56 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm">
            <span className="font-medium text-text-primary">{selected.size} selected</span>
            <button
              type="button"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("suspend")}
              className="rounded-md border border-danger/40 px-3 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {t("userDirectory.suspendSelected")}
            </button>
            <button
              type="button"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("reactivate")}
              className="rounded-md border border-accent/40 px-3 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {t("userDirectory.reactivateSelected")}
            </button>
            {bulkMutation.isPending && <span className="text-xs text-text-dim">{t("userDirectory.working")}</span>}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-text-dim hover:text-text-primary"
            >
              {t("userDirectory.clear")}
            </button>
          </div>
        )}

        {bulkError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">{bulkError}</div>
        )}

        {isLoading && <p className="text-sm text-text-secondary">{t("userDirectory.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load users.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("userDirectory.retry")}
            </button>
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="w-8 px-4 py-3 font-normal">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label={t("userDirectory.selectAllUsersOn")}
                    />
                  </th>
                  <th className="px-4 py-3 font-normal">{t("userDirectory.userAccountId")}</th>
                  <th className="px-4 py-3 font-normal">{t("userDirectory.membership")}</th>
                  <th className="px-4 py-3 font-normal">{t("userDirectory.channel")}</th>
                  <th className="px-4 py-3 font-normal">{t("userDirectory.status")}</th>
                  <th className="px-4 py-3 font-normal">{t("userDirectory.registered")}</th>
                  <th className="px-4 py-3 font-normal">{t("userDirectory.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        aria-label={`Select ${u.fullName}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{u.fullName}</div>
                      <div className="text-xs text-text-dim">{u.email}</div>
                      <div className="text-[10px] text-text-dim">{u.id}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{MEMBERSHIP_LABELS[u.membership]}</td>
                    <td className="px-4 py-3 text-text-secondary">{CHANNEL_LABELS[u.channel] ?? u.channel}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link to={`/users/${u.id}`} className="text-xs text-accent hover:underline">
                        {t("userDirectory.view")}
                      </Link>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim">
                      {t("userDirectory.noUsersMatchThese")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle={t("userDirectory.noBackingFieldExists")}
          />
        )}
      </div>
    </AppShell>
  );
}
