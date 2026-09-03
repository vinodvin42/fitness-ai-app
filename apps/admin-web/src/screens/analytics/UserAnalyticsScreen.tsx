import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COMMON_COUNTRIES, type AdminUserAnalyticsResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ANALYTICS_SUB_NAV } from "./subNav";

type Tab = "userAnalytics" | "training" | "nutrition" | "recovery" | "ai" | "business" | "geographic";
const TABS: { key: Tab; label: string }[] = [
  { key: "userAnalytics", label: "User Analytics" },
  { key: "training", label: "Training" },
  { key: "nutrition", label: "Nutrition" },
  { key: "recovery", label: "Recovery" },
  { key: "ai", label: "AI" },
  { key: "business", label: "Business" },
  { key: "geographic", label: "Geographic" },
];

const CHART_AXIS = { stroke: "#5b6472", fontSize: 11, tickLine: false, axisLine: false } as const;
const CHART_TOOLTIP = {
  contentStyle: { background: "#161b22", border: "1px solid #232a33", borderRadius: 8 },
  labelStyle: { color: "#f5f7fa" },
} as const;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const COUNTRY_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  COMMON_COUNTRIES.map((c) => [c.code, c.name]),
);

/** Resolves a country name for display — falls back to the raw code (or "Unknown" for null) when it's outside COMMON_COUNTRIES' curated list, since the backend accepts any real 2-letter code. */
function countryName(code: string | null): string {
  if (code === null) return "Unknown";
  return COUNTRY_NAME_BY_CODE[code] ?? code;
}

interface Filters {
  startDate: string;
  endDate: string;
}

async function fetchUserAnalytics(filters: Filters): Promise<AdminUserAnalyticsResponse> {
  const res = await apiClient.get<AdminUserAnalyticsResponse>("/admin/analytics/users", {
    params: { startDate: filters.startDate || undefined, endDate: filters.endDate || undefined },
  });
  return res.data;
}

/**
 * 09.01 User Analytics (docs/admin/03-screen-inventory.md §09.01), added
 * 25 Aug 2026 — the console's first cross-user growth/engagement/revenue
 * view with an admin-adjustable date range (the Executive Dashboard's
 * numbers are fixed to 30 days / 6 months). See apps/api's
 * adminAnalytics.service.ts for the full real-vs-not breakdown: User
 * Analytics/Training/Nutrition tabs are real. **26 Aug 2026: the AI tab
 * and the "compare" toggle are real too** (`AiCoachMessage` aggregates,
 * and each KPI's raw previous-period value respectively), **and so is
 * Geographic** — a live `User.countryCode` snapshot table (country, user
 * count, % of total, all-time revenue), decoupled from the date filter
 * like Retention Cohorts, with a real "Unknown" bucket for anyone who
 * hasn't set it. No map — no mapping library exists in this build. Also
 * deliberately not a separate 09.05 route: it'd duplicate this tab
 * exactly, so it stays combined, same precedent as Security/Subscription/
 * Coach Discovery. Recovery/Business remain genuinely not built, since
 * neither has any backing data anywhere in this build — each renders via
 * `NotAvailablePanel` rather than an empty or fabricated tab. Gained
 * `ANALYTICS_SUB_NAV` the same day 09.02/09.03 joined as real, separate
 * screens.
 */
export function UserAnalyticsScreen() {
  const [filters, setFilters] = useState<Filters>({ startDate: "", endDate: "" });
  const [tab, setTab] = useState<Tab>("userAnalytics");
  const [compare, setCompare] = useState(false);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-analytics-users", filters],
    queryFn: () => fetchUserAnalytics(filters),
  });

  const notAvailableTab: Record<string, string> = {
    recovery: "recoveryAnalytics",
    business: "businessAnalytics",
  };

  return (
    <AppShell title="Analytics" subNav={ANALYTICS_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
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
              </button>
            ))}
          </div>

          <div className="flex items-end gap-3 rounded-lg border border-border-subtle bg-surface p-3">
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
            <span className="pb-1.5 text-[11px] text-text-dim">Defaults to last 30 days</span>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-text-secondary">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
              Compare to previous period
            </label>
          </div>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load analytics.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && tab === "userAnalytics" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <StatCard
                label="New Users"
                value={data.kpis.newUsers.value}
                trendPct={data.kpis.newUsers.trendPct}
                hint={compare ? `vs. ${data.kpis.newUsers.previousValue} previous period` : undefined}
              />
              <StatCard
                label="Active Users"
                value={data.kpis.activeUsers.value}
                trendPct={data.kpis.activeUsers.trendPct}
                hint={compare ? `vs. ${data.kpis.activeUsers.previousValue} previous period` : "Trained, logged a meal, or logged a measurement"}
              />
              <StatCard
                label="Revenue"
                value={money(data.kpis.revenueCents.value)}
                trendPct={data.kpis.revenueCents.trendPct}
                hint={compare ? `vs. ${money(data.kpis.revenueCents.previousValue)} previous period` : undefined}
              />
              <StatCard
                label="Referral Signups"
                value={data.kpis.referralSignups.value}
                trendPct={data.kpis.referralSignups.trendPct}
                hint={compare ? `vs. ${data.kpis.referralSignups.previousValue} previous period` : undefined}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">Signups per day</div>
                <div className="mt-3 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.signupSeries}>
                      <XAxis dataKey="date" tickFormatter={(v) => shortDate(String(v))} {...CHART_AXIS} />
                      <YAxis allowDecimals={false} width={28} {...CHART_AXIS} />
                      <Tooltip {...CHART_TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
                      <Line type="monotone" dataKey="count" stroke="#12e5a6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">Revenue per day</div>
                <div className="mt-3 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.revenueSeries}>
                      <XAxis dataKey="date" tickFormatter={(v) => shortDate(String(v))} {...CHART_AXIS} />
                      <YAxis width={40} tickFormatter={(v) => money(Number(v))} {...CHART_AXIS} />
                      <Tooltip
                        {...CHART_TOOLTIP}
                        labelFormatter={(v) => shortDate(String(v))}
                        formatter={(v) => money(Number(v))}
                      />
                      <Line type="monotone" dataKey="amountCents" stroke="#6b8ff5" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Retention Cohorts — last 6 months</div>
              <p className="mt-1 text-xs text-text-dim">
                % of each month's new signups who logged ≥1 workout in that relative month. Independent of the date
                filter above — a cohort table needs its own month-over-month axis. "—" means too early to know.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-3 py-2 font-normal">Cohort</th>
                      <th className="px-3 py-2 font-normal">Size</th>
                      <th className="px-3 py-2 font-normal">Month 0</th>
                      <th className="px-3 py-2 font-normal">Month 1</th>
                      <th className="px-3 py-2 font-normal">Month 2</th>
                      <th className="px-3 py-2 font-normal">Month 3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retentionCohorts.map((c) => (
                      <tr key={c.cohort} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2 font-medium text-text-primary">{c.cohort}</td>
                        <td className="px-3 py-2 text-text-secondary">{c.cohortSize}</td>
                        {c.retention.map((r) => (
                          <td key={r.offset} className="px-3 py-2">
                            {r.retainedPct === null ? (
                              <span className="text-text-dim">—</span>
                            ) : (
                              <span
                                className="inline-block rounded px-2 py-0.5 text-xs font-medium text-text-primary"
                                style={{ backgroundColor: `rgba(18, 229, 166, ${Math.min(0.12 + r.retainedPct / 130, 0.85)})` }}
                              >
                                {r.retainedPct}%
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {data && tab === "training" && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Workouts Completed" value={data.trainingStats.totalWorkoutsCompleted} hint="In the selected date range" />
            <StatCard label="Sets Logged" value={data.trainingStats.totalSetsLogged} hint="In the selected date range" />
            <StatCard label="Avg Sets / Session" value={data.trainingStats.avgSetsPerSession ?? "—"} />
          </div>
        )}

        {data && tab === "nutrition" && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Meals Logged" value={data.nutritionStats.totalMealsLogged} hint="In the selected date range" />
            <StatCard label="Water Logs" value={data.nutritionStats.totalWaterLogs} hint="In the selected date range" />
            <StatCard label="Avg Water Logs / Active User" value={data.nutritionStats.avgWaterLogsPerActiveUser ?? "—"} />
          </div>
        )}

        {data && tab === "ai" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="AI Messages Sent" value={data.aiStats.totalMessages} hint="User prompts, in the selected date range" />
              <StatCard label="Users Using AI Coach" value={data.aiStats.usersUsingAi} />
              <StatCard label="Avg Messages / AI User" value={data.aiStats.avgMessagesPerAiUser ?? "—"} />
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">AI Coach messages per day</div>
              <div className="mt-3 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.aiStats.messageSeries}>
                    <XAxis dataKey="date" tickFormatter={(v) => shortDate(String(v))} {...CHART_AXIS} />
                    <YAxis allowDecimals={false} width={28} {...CHART_AXIS} />
                    <Tooltip {...CHART_TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
                    <Line type="monotone" dataKey="count" stroke="#c084fc" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {data && tab === "geographic" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total Users" value={data.geographic.totalUsers} />
              <StatCard
                label="Countries Represented"
                value={data.geographic.breakdown.filter((r) => r.countryCode !== null).length}
              />
              <StatCard
                label="Unset"
                value={`${data.geographic.breakdown.find((r) => r.countryCode === null)?.userPct ?? 0}%`}
                hint="Users who haven't set a country on Edit Profile"
              />
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Users by country</div>
              <p className="mt-1 text-xs text-text-dim">
                A live snapshot of the current user base, independent of the date filter above — same reasoning as
                Retention Cohorts. Revenue is all-time captured payments, not date-scoped. No map — no mapping
                library exists in this build, see this screen's own doc comment.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-3 py-2 font-normal">Country</th>
                      <th className="px-3 py-2 font-normal">Users</th>
                      <th className="px-3 py-2 font-normal">% of Total</th>
                      <th className="px-3 py-2 font-normal">Revenue (all-time)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.geographic.breakdown.map((row) => (
                      <tr key={row.countryCode ?? "unknown"} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2 font-medium text-text-primary">
                          {countryName(row.countryCode)}
                          {row.countryCode === null && <span className="ml-2 text-[11px] text-text-dim">(profile not set)</span>}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{row.userCount}</td>
                        <td className="px-3 py-2 text-text-secondary">{row.userPct}%</td>
                        <td className="px-3 py-2 text-text-secondary">{money(row.revenueCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {data && notAvailableTab[tab] && (
          <NotAvailablePanel
            keys={[notAvailableTab[tab]]}
            subtitle="No backing data exists anywhere in this build for this tab — see this screen's own doc comment for why."
          />
        )}
      </div>
    </AppShell>
  );
}
