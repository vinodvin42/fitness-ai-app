import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminRevenueResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

interface Filters {
  startDate: string;
  endDate: string;
}

async function fetchRevenue(filters: Filters): Promise<AdminRevenueResponse> {
  const res = await apiClient.get<AdminRevenueResponse>("/admin/finance/revenue", {
    params: { startDate: filters.startDate || undefined, endDate: filters.endDate || undefined },
  });
  return res.data;
}

/**
 * 10.02 Revenue (docs/admin/03-screen-inventory.md §10.02), added 26 Aug
 * 2026. Real revenue-by-purpose and revenue-by-plan breakdown, a monthly
 * trend, and a real payment-status breakdown, all from the same `Payment`
 * data Commerce (Module 06) already owns — see adminFinance.service.ts's
 * "one ledger" decision. The region slice of this screen is
 * `notAvailable` — no `User.region` field exists, same gap 09.05
 * Geographic is blocked on.
 */
export function RevenueScreen() {
  const [filters, setFilters] = useState<Filters>({ startDate: "", endDate: "" });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-finance-revenue", filters],
    queryFn: () => fetchRevenue(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <AppShell title="Revenue" subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
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
          <span className="pb-1.5 text-[11px] text-text-dim">Defaults to all-time</span>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load revenue.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard label="Total Revenue" value={money(data.totalRevenueCents)} />
              <StatCard label="Subscriptions" value={money(data.byPurpose.subscriptionCents)} />
              <StatCard label="Program Purchases" value={money(data.byPurpose.programPurchaseCents)} />
              <StatCard label="Coach Bookings" value={money(data.byPurpose.bookingCents)} />
              <StatCard
                label="Payment Success"
                value={
                  data.statusBreakdown.paid + data.statusBreakdown.failed + data.statusBreakdown.created > 0
                    ? `${Math.round(
                        (data.statusBreakdown.paid /
                          (data.statusBreakdown.paid + data.statusBreakdown.failed + data.statusBreakdown.created)) *
                          100,
                      )}%`
                    : "—"
                }
                hint={`${data.statusBreakdown.paid} paid · ${data.statusBreakdown.failed} failed · ${data.statusBreakdown.created} pending`}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
                Plan performance
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">Plan</th>
                    <th className="px-4 py-3 font-normal">Tier</th>
                    <th className="px-4 py-3 font-normal">Revenue</th>
                    <th className="px-4 py-3 font-normal">Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPlan.map((p) => (
                    <tr key={p.planId} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 font-medium text-text-primary">{p.planName}</td>
                      <td className="px-4 py-3 capitalize text-text-secondary">{p.tier}</td>
                      <td className="px-4 py-3 text-text-secondary">{money(p.revenueCents)}</td>
                      <td className="px-4 py-3 text-text-secondary">{p.count}</td>
                    </tr>
                  ))}
                  {data.byPlan.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-text-dim">
                        No subscription revenue in this range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
                Monthly trend
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">Month</th>
                    <th className="px-4 py-3 font-normal">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((t) => (
                    <tr key={t.month} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-text-primary">{t.month}</td>
                      <td className="px-4 py-3 text-text-secondary">{money(t.revenueCents)}</td>
                    </tr>
                  ))}
                  {data.trend.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-text-dim">
                        No revenue in this range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <NotAvailablePanel
              keys={data.notAvailable}
              subtitle="No User.region field exists anywhere in this build — see adminFinance.service.ts."
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
