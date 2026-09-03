import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminReferralDirectoryResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { GROWTH_SUB_NAV } from "./subNav";

interface Filters {
  search: string;
  startDate: string;
  endDate: string;
}

async function fetchReferrals(filters: Filters): Promise<AdminReferralDirectoryResponse> {
  const res = await apiClient.get<AdminReferralDirectoryResponse>("/admin/referrals", {
    params: {
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    },
  });
  return res.data;
}

/**
 * 07.03 Referrals (docs/admin/03-screen-inventory.md §07.03), added 25 Aug
 * 2026 — the first admin surface over the real `Referral` model. Picked as
 * this cycle's slice because it's the one genuinely unblocked gap left in
 * the console — see apps/api's adminReferrals.service.ts for the full
 * real-vs-not breakdown and why. Every other spec'd element of Module 07
 * (07.01/07.02 Influencers, 07.04 Campaigns) needs its own new entity, so
 * this stays a single top-level screen — no `subNav`, same precedent as
 * Relationships/Users/Commerce/Support before their modules grew a second
 * screen. Read-only: a `Referral` row is a historical attribution fact,
 * not something an admin has any legitimate reason to edit.
 */
export function ReferralsScreen() {
  const [filters, setFilters] = useState<Filters>({ search: "", startDate: "", endDate: "" });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-referrals", filters],
    queryFn: () => fetchReferrals(filters),
  });

  return (
    <AppShell title="Referrals" subNav={GROWTH_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Referrals" value={data.stats.totalReferrals} hint="In the current filtered scope" />
            <StatCard label="Unique Referrers" value={data.stats.uniqueReferrers} hint="Distinct users who've referred someone" />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            From
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter("startDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            To
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilter("endDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Search
            <input
              type="search"
              placeholder="Referrer or referee name/email…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-64 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load referrals.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && data.topReferrers.length > 0 && (
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-dim">Top Referrers</div>
            <ol className="mt-3 space-y-2">
              {data.topReferrers.map((r, i) => (
                <li key={r.userId} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-center font-mono text-xs text-text-dim">{i + 1}</span>
                  <span className="flex-1">
                    <span className="font-medium text-text-primary">{r.name}</span>{" "}
                    <span className="text-xs text-text-dim">{r.email}</span>
                  </span>
                  <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
                    {r.referralCount} referral{r.referralCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Referrer</th>
                  <th className="px-4 py-3 font-normal">Referee</th>
                  <th className="px-4 py-3 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{r.referrerName}</div>
                      <div className="text-xs text-text-dim">{r.referrerEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{r.refereeName}</div>
                      <div className="text-xs text-text-dim">{r.refereeEmail}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-text-dim">
                      No referrals match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && <NotAvailablePanel keys={data.notAvailable} subtitle="Neither exists in this build yet — see this screen's own doc comment for why." />}
      </div>
    </AppShell>
  );
}
