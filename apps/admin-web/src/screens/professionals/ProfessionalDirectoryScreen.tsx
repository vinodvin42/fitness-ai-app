import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminProfessionalDirectoryResponse, ProfessionalDirectoryTab } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { PROFESSIONALS_SUB_NAV } from "./subNav";

const TABS: { key: ProfessionalDirectoryTab; label: string }[] = [
  { key: "all", label: "All Professionals" },
  { key: "pendingVerification", label: "Pending Verification" },
  { key: "active", label: "Active" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
  { key: "credentialsExpiring", label: "Credentials Expiring" },
];

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

// Capacity oversight (R2 Wave 6.2, 22 Sep 2026) — client-side sort over the
// same rows `listProfessionals` (apps/api's adminProfessionals.service.ts)
// already returns with `activeClients`/`maxActiveClients`/`lifecycleStatus`
// per row (R2 Wave 2's own addition, previously only ever rendered as the
// static "X / Y" cell below). A real audit found no admin-wide view could
// answer "who's at/over capacity, who has headroom, who's stuck at 0
// despite being available" across the whole roster at once — this is that
// view: a sort control over already-fetched data, not a new aggregation
// endpoint (see this wave's docs/admin/07-open-questions-gaps.md entry for
// why a whole second directory screen would have been redundant here).
type CapacitySort = "recent" | "utilizationDesc" | "utilizationAsc";

const SORT_OPTIONS: { key: CapacitySort; label: string }[] = [
  { key: "recent", label: "Newest" },
  { key: "utilizationDesc", label: "Capacity: Fullest first" },
  { key: "utilizationAsc", label: "Capacity: Most headroom first" },
];

/** `activeClients / maxActiveClients`, treated as +Infinity when `maxActiveClients` is 0 (over capacity by definition) so a 0-cap row with any active client always sorts to the very top of "fullest first". */
function utilizationRatio(p: { activeClients: number; maxActiveClients: number }): number {
  if (p.maxActiveClients <= 0) return p.activeClients > 0 ? Infinity : 0;
  return p.activeClients / p.maxActiveClients;
}

async function fetchDirectory(tab: ProfessionalDirectoryTab, search: string): Promise<AdminProfessionalDirectoryResponse> {
  const res = await apiClient.get<AdminProfessionalDirectoryResponse>("/admin/professionals", {
    params: { tab, search: search || undefined },
  });
  return res.data;
}

/**
 * 03.01 Professional Directory (docs/admin/03-screen-inventory.md §03) —
 * the first real screen in Module 03, added 21 Aug 2026. See
 * apps/api's adminProfessionals.service.ts for exactly which Figma-spec'd
 * columns (Region, Languages, Rating, Earnings MTD) have no backing field
 * and are surfaced via `NotAvailablePanel` below rather than faked. Bulk
 * row-select is intentionally not built — this build has no bulk-action
 * business logic (bulk suspend/message/export) for a checkbox column to
 * actually drive, and an inert checkbox would misrepresent a real feature.
 *
 * **26 Aug 2026: a real Reactivate action was added here for suspended
 * rows.** `POST /admin/professionals/:id/reactivate` has existed since
 * this module shipped, and Credential Verification's own Suspend
 * Application action has always described itself as "reversible from
 * the Directory" — but nothing in this screen ever actually called it,
 * a genuine gap between a real backend endpoint and a claim the UI made
 * about itself. Found and fixed while investigating Module 02's
 * suspend/reactivate build below, which mirrors this exact pattern.
 */
export function ProfessionalDirectoryScreen() {
  const [tab, setTab] = useState<ProfessionalDirectoryTab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CapacitySort>("recent");
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-professionals", tab, search],
    queryFn: () => fetchDirectory(tab, search),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/professionals/${id}/reactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-professionals"] }),
  });

  // Capacity oversight sort — see this file's top comment. Sorts the
  // already-fetched page of rows client-side; doesn't touch the query/tab
  // filtering above.
  const sortedProfessionals = data
    ? [...data.professionals].sort((a, b) => {
        if (sort === "utilizationDesc") return utilizationRatio(b) - utilizationRatio(a);
        if (sort === "utilizationAsc") return utilizationRatio(a) - utilizationRatio(b);
        return 0; // "recent" — keep the server's own createdAt-desc order
      })
    : [];

  return (
    <AppShell title="Professional Directory" subNav={PROFESSIONALS_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  tab === t.key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-subtle text-text-secondary hover:text-text-primary"
                }`}
              >
                {t.label}
                {data && <span className="ml-1.5 text-text-dim">{data.counts[t.key]}</span>}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as CapacitySort)}
              aria-label="Sort by capacity utilization"
              className="rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-xs text-text-secondary outline-none focus:border-accent"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load professionals.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Professional</th>
                  <th className="px-4 py-3 font-normal">Services</th>
                  <th className="px-4 py-3 font-normal">Experience</th>
                  <th className="px-4 py-3 font-normal">Active Clients</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">KYC</th>
                  <th className="px-4 py-3 font-normal">Lifecycle</th>
                  <th className="px-4 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedProfessionals.map((p) => {
                  const ratio = utilizationRatio(p);
                  // Capacity oversight color coding — see this file's top
                  // comment. Three real signals an admin scanning the whole
                  // roster cares about: over capacity (ratio >= 1, real
                  // over-booking risk), zero clients despite being
                  // `available` (real dead capacity — the coach is
                  // marketplace-visible but getting nothing), and everyone
                  // else (no flag needed).
                  const overCapacity = p.maxActiveClients > 0 && ratio >= 1;
                  const idleDespiteAvailable = p.activeClients === 0 && p.lifecycleStatus === "available";
                  const capacityClass = overCapacity
                    ? "text-danger font-medium"
                    : idleDespiteAvailable
                      ? "text-warning font-medium"
                      : "text-text-secondary";
                  return (
                    <tr key={p.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{p.fullName}</div>
                        <div className="text-xs text-text-dim">{p.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.services.length === 0 && <span className="text-xs text-text-dim">—</span>}
                          {p.services.map((s) => {
                            const expiringSoon =
                              s.expiresAt != null && new Date(s.expiresAt).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000;
                            return (
                              <span
                                key={s.serviceType}
                                title={s.expiresAt ? `Expires ${new Date(s.expiresAt).toLocaleDateString()}` : undefined}
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                  expiringSoon
                                    ? "border-warning/50 bg-warning/10 text-warning"
                                    : "border-border-subtle text-text-secondary"
                                }`}
                              >
                                {SERVICE_LABELS[s.serviceType] ?? s.serviceType}
                                {expiringSoon ? " ⚠" : ""}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {p.yearsExperience != null ? `${p.yearsExperience} yrs` : "—"}
                      </td>
                      <td className={`px-4 py-3 ${capacityClass}`} title={idleDespiteAvailable ? "Available but has zero active clients" : overCapacity ? "At or over capacity" : undefined}>
                        {p.activeClients} / {p.maxActiveClients}
                        {overCapacity ? " ⚠" : idleDespiteAvailable ? " ○" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.kycStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.lifecycleStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link to={`/professionals/${p.id}`} className="text-xs text-accent hover:underline">
                            View →
                          </Link>
                          {p.status === "suspended" && (
                            <button
                              type="button"
                              disabled={reactivateMutation.isPending && reactivateMutation.variables === p.id}
                              onClick={() => reactivateMutation.mutate(p.id)}
                              className="text-xs text-accent hover:underline disabled:opacity-50"
                            >
                              {reactivateMutation.isPending && reactivateMutation.variables === p.id
                                ? "Reactivating…"
                                : "Reactivate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {sortedProfessionals.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-text-dim">
                      No professionals in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {reactivateMutation.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(reactivateMutation.error, "Couldn't reactivate that professional.")}
          </div>
        )}

        {data && (
          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle="No backing field exists yet for these Figma-spec'd directory columns — see adminProfessionals.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
