import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { AdminEngagementAnalyticsResponse } from "@fitness-ai-app/types";
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

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

async function fetchEngagement(filters: Filters): Promise<AdminEngagementAnalyticsResponse> {
  const res = await apiClient.get<AdminEngagementAnalyticsResponse>("/admin/analytics/engagement", {
    params: { startDate: filters.startDate || undefined, endDate: filters.endDate || undefined },
  });
  return res.data;
}

const FUNNEL_STAGES: { key: keyof AdminEngagementAnalyticsResponse["funnel"]; label: string }[] = [
  { key: "signedUp", label: "Signed Up" },
  { key: "completedOnboarding", label: "Completed Onboarding" },
  { key: "loggedFirstWorkout", label: "Logged First Workout" },
  { key: "retainedWeek1", label: "Retained (7 Days)" },
];

/**
 * 09.02 Engagement (docs/admin/03-screen-inventory.md §09.02), added
 * 26 Aug 2026 — a genuinely distinct screen from 09.01's tabs, not a
 * near-duplicate: a real conversion **funnel** (signup → onboarding →
 * first workout → 7-day retention, all real `User`/`OnboardingProfile`/
 * `WorkoutSession` data) and a weekly retention curve, both answering "do
 * new users convert and stick" rather than 09.01's "do existing cohorts
 * keep training". See adminAnalytics.service.ts's `computeFunnel`/
 * `computeWeeklyRetention` for the full logic.
 */
export function EngagementScreen() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({ startDate: "", endDate: "" });
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-analytics-engagement", filters],
    queryFn: () => fetchEngagement(filters),
  });

  return (
    <AppShell title={t("engagement.engagement")} subNav={ANALYTICS_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-md text-xs text-text-secondary">
            {t("engagement.howNewSignupsConvert")}
          </p>
          <div className="flex items-end gap-3 rounded-lg border border-border-subtle bg-surface p-3">
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              {t("engagement.from")}
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
            <span className="pb-1.5 text-[11px] text-text-dim">{t("engagement.defaultsToLast30")}</span>
          </div>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">{t("engagement.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load engagement analytics.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("engagement.retry")}
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="mb-3 text-xs uppercase tracking-wide text-text-dim">{t("engagement.signupRetentionFunnel")}</div>
              <div className="grid grid-cols-4 gap-3">
                {FUNNEL_STAGES.map((stage, i) => {
                  const value = data.funnel[stage.key];
                  const prevValue = i === 0 ? data.funnel.signedUp : data.funnel[FUNNEL_STAGES[i - 1].key];
                  return (
                    <StatCard
                      key={stage.key}
                      label={stage.label}
                      value={value}
                      hint={i === 0 ? "In the selected date range" : `${pct(value, data.funnel.signedUp)} of signups · ${pct(value, prevValue)} of previous stage`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("engagement.weeklyRetentionLast6")}</div>
              <p className="mt-1 text-xs text-text-dim">
                % of each week's new signups who logged ≥1 workout in that relative week. Independent of the date
                filter above, same reasoning as 09.01's monthly cohort table.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-3 py-2 font-normal">{t("engagement.weekOf")}</th>
                      <th className="px-3 py-2 font-normal">{t("engagement.size")}</th>
                      <th className="px-3 py-2 font-normal">{t("engagement.week0")}</th>
                      <th className="px-3 py-2 font-normal">{t("engagement.week1")}</th>
                      <th className="px-3 py-2 font-normal">{t("engagement.week2")}</th>
                      <th className="px-3 py-2 font-normal">{t("engagement.week3")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeklyRetention.map((c) => (
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
                                style={{ backgroundColor: `rgba(192, 132, 252, ${Math.min(0.12 + r.retainedPct / 130, 0.85)})` }}
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

            {data.byDay && (
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">{t("engagement.dayByDayFunnel")}</div>
                <div className="mt-3 max-h-72 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="sticky top-0 border-b border-border-subtle bg-surface text-xs uppercase tracking-wide text-text-dim">
                        <th className="px-3 py-2 font-normal">{t("engagement.date")}</th>
                        <th className="px-3 py-2 font-normal">{t("engagement.signedUp")}</th>
                        <th className="px-3 py-2 font-normal">{t("engagement.onboarded")}</th>
                        <th className="px-3 py-2 font-normal">{t("engagement.firstWorkout")}</th>
                        <th className="px-3 py-2 font-normal">{t("engagement.retained7d")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDay.map((d) => (
                        <tr key={d.date} className="border-b border-border-subtle last:border-0">
                          <td className="px-3 py-2 text-text-primary">{shortDate(d.date)}</td>
                          <td className="px-3 py-2 text-text-secondary">{d.signedUp}</td>
                          <td className="px-3 py-2 text-text-secondary">{d.completedOnboarding}</td>
                          <td className="px-3 py-2 text-text-secondary">{d.loggedFirstWorkout}</td>
                          <td className="px-3 py-2 text-text-secondary">{d.retainedWeek1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <NotAvailablePanel
              keys={data.notAvailable}
              subtitle={t("engagement.theDayByDay")}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
