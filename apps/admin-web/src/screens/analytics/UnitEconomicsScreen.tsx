import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { AdminUnitEconomicsResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ANALYTICS_SUB_NAV } from "./subNav";

interface Filters {
  startDate: string;
  endDate: string;
}

function money(cents: number | null): string {
  return cents === null ? "—" : `₹${(cents / 100).toFixed(2)}`;
}

async function fetchUnitEconomics(filters: Filters): Promise<AdminUnitEconomicsResponse> {
  const res = await apiClient.get<AdminUnitEconomicsResponse>("/admin/analytics/unit-economics", {
    params: { startDate: filters.startDate || undefined, endDate: filters.endDate || undefined },
  });
  return res.data;
}

/**
 * 09.06 Unit Economics / Cohorts (docs/admin/03-screen-inventory.md
 * §09.06), added 27 Aug 2026. `reports/build-plan.html`'s own "needs your
 * decision" framing said CAC needed "an admin-entered monthly spend
 * figure" to become real — re-investigating directly (not trusting that
 * framing at face value) found that figure had already shipped a day
 * earlier as Finance's real `Expense.category: "marketing"` (10.03). This
 * screen just reads it — no new entity, no new product decision.
 *
 * The Figma's fuller spec (metric tiles, a ratio callout with a benchmark
 * tag, sparkline cards, a cohort table, a donut split with a leaderboard,
 * a waterfall chart) is only partly buildable with real data — see
 * `adminAnalytics.service.ts`'s `getUnitEconomics` doc comment for the
 * full real-vs-not accounting. Built here: New Users / Marketing Spend /
 * CAC as real KPI tiles (CAC's trend pill is inverted — a rising CAC is
 * bad news, the one metric anywhere in this console where that's true,
 * see `StatCard`'s own 27 Aug 2026 comment), an all-time Average LTV and
 * LTV:CAC ratio (deliberately no fabricated "benchmark" tag), and a real
 * Cohort Economics table — the same 6-month grouping as 09.01's Retention
 * Cohorts, reporting each cohort's real avg lifetime revenue alongside
 * that month's real marketing spend/CAC. NOT built: the acquisition-
 * channel donut/leaderboard (no channel dimension exists anywhere —
 * `Expense.category` is one flat "marketing" bucket) and the waterfall
 * chart (no single unambiguous real breakdown exists for one) — both
 * render via `NotAvailablePanel`.
 */
export function UnitEconomicsScreen() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({ startDate: "", endDate: "" });
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-analytics-unit-economics", filters],
    queryFn: () => fetchUnitEconomics(filters),
  });

  return (
    <AppShell title={t("unitEconomics.unitEconomics")} subNav={ANALYTICS_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-md text-xs text-text-secondary">
            {t("unitEconomics.whatItCostsTo")}
          </p>
          <div className="flex items-end gap-3 rounded-lg border border-border-subtle bg-surface p-3">
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("unitEconomics.from")}
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
            <span className="pb-1.5 text-[11px] text-text-dim">{t("unitEconomics.appliesToNewUsers")}</span>
          </div>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">{t("unitEconomics.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load unit economics.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("unitEconomics.retry")}
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <StatCard
                label={t("unitEconomics.newUsers")}
                value={data.kpis.newUsers.value}
                trendPct={data.kpis.newUsers.trendPct}
                hint="Selected period"
              />
              <StatCard
                label={t("unitEconomics.marketingSpend")}
                value={money(data.kpis.marketingSpendCents.value)}
                trendPct={data.kpis.marketingSpendCents.trendPct}
                hint="Real Expense rows, category: marketing"
              />
              <StatCard
                label="CAC"
                value={money(data.kpis.cacCents.value)}
                trendPct={data.kpis.cacCents.trendPct}
                invert
                hint={data.kpis.cacCents.value === null ? "No marketing spend logged this period" : "Marketing spend ÷ new users"}
              />
              <StatCard
                label={t("unitEconomics.avgLtv")}
                value={money(data.avgLtvCents)}
                hint={`All-time, across ${data.totalUsers} users — not scoped to the date filter above`}
              />
              <StatCard
                label={t("unitEconomics.ltvCac")}
                value={data.ltvToCacRatio === null ? "—" : `${data.ltvToCacRatio.toFixed(2)} : 1`}
                hint="All-time avg LTV ÷ this period's CAC"
              />
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("unitEconomics.cohortEconomicsLast6")}</div>
              <p className="mt-1 text-xs text-text-dim">
                Each signup cohort's real avg lifetime revenue alongside that calendar month's real marketing spend
                and CAC. Independent of the date filter above, same reasoning as 09.01's Retention Cohort table.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-3 py-2 font-normal">{t("unitEconomics.cohort")}</th>
                      <th className="px-3 py-2 font-normal">{t("unitEconomics.size")}</th>
                      <th className="px-3 py-2 font-normal">{t("unitEconomics.avgLtv")}</th>
                      <th className="px-3 py-2 font-normal">{t("unitEconomics.marketingSpend")}</th>
                      <th className="px-3 py-2 font-normal">CAC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map((c) => (
                      <tr key={c.cohort} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2 font-medium text-text-primary">{c.cohort}</td>
                        <td className="px-3 py-2 text-text-secondary">{c.cohortSize}</td>
                        <td className="px-3 py-2 text-text-secondary">{money(c.avgLtvCents)}</td>
                        <td className="px-3 py-2 text-text-secondary">{money(c.marketingSpendCents)}</td>
                        <td className="px-3 py-2 text-text-secondary">{money(c.cacCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <NotAvailablePanel
              keys={data.notAvailable}
              subtitle={t("unitEconomics.theFigmaSDonut")}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
