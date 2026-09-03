import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminFitnessNutritionAnalyticsResponse } from "@fitness-ai-app/types";
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

async function fetchFitnessNutrition(filters: Filters): Promise<AdminFitnessNutritionAnalyticsResponse> {
  const res = await apiClient.get<AdminFitnessNutritionAnalyticsResponse>("/admin/analytics/fitness-nutrition", {
    params: { startDate: filters.startDate || undefined, endDate: filters.endDate || undefined },
  });
  return res.data;
}

/**
 * 09.03 Fitness & Nutrition (docs/admin/03-screen-inventory.md §09.03),
 * added 26 Aug 2026 — a real drill-down BELOW 09.01's Training/Nutrition
 * tabs' plain totals, not a re-skin of them: top-logged exercises,
 * per-program completion rates (real `WorkoutSession` coverage across
 * each program's purchasers), top-logged meals, and the spec's combined
 * "recovery/AI usage card" — AI half real (reuses the same
 * `AiCoachMessage` aggregate as 09.01's AI tab), Recovery half honestly
 * NOT built (no wearable/HealthKit integration exists anywhere in this
 * build). See adminAnalytics.service.ts's `getFitnessNutritionAnalytics`.
 */
export function FitnessNutritionScreen() {
  const [filters, setFilters] = useState<Filters>({ startDate: "", endDate: "" });
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-analytics-fitness-nutrition", filters],
    queryFn: () => fetchFitnessNutrition(filters),
  });

  return (
    <AppShell title="Fitness & Nutrition" subNav={ANALYTICS_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-md text-xs text-text-secondary">
            A split view of training and nutrition engagement, below the totals on the User Analytics tabs.
          </p>
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
          </div>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load fitness & nutrition analytics.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="mb-3 text-xs uppercase tracking-wide text-text-dim">Training</div>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Workouts" value={data.training.stats.totalWorkoutsCompleted} />
                  <StatCard label="Sets Logged" value={data.training.stats.totalSetsLogged} />
                  <StatCard label="Avg Sets/Session" value={data.training.stats.avgSetsPerSession ?? "—"} />
                </div>
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="mb-2 text-xs uppercase tracking-wide text-text-dim">Top exercises</div>
                {data.training.topExercises.length === 0 ? (
                  <p className="text-xs text-text-dim">No sets logged in this range.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.training.topExercises.map((ex) => (
                      <li key={ex.exerciseId} className="flex items-center justify-between text-sm">
                        <span className="text-text-primary">
                          {ex.name} <span className="text-text-dim">· {ex.muscleGroup}</span>
                        </span>
                        <span className="text-text-secondary">{ex.setsLogged} sets</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="mb-2 text-xs uppercase tracking-wide text-text-dim">Program progress</div>
                <p className="mb-2 text-[11px] text-text-dim">
                  Avg % of each program's workouts a purchaser has completed at least once, all-time.
                </p>
                {data.training.programProgress.length === 0 ? (
                  <p className="text-xs text-text-dim">No purchased programs yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.training.programProgress.map((p) => (
                      <li key={p.programId}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-primary">{p.name}</span>
                          <span className="text-text-secondary">
                            {p.avgCompletionPct === null ? "—" : `${p.avgCompletionPct}%`} · {p.purchasers} purchasers
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${p.avgCompletionPct ?? 0}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="mb-3 text-xs uppercase tracking-wide text-text-dim">Nutrition</div>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Meals Logged" value={data.nutrition.stats.totalMealsLogged} />
                  <StatCard label="Water Logs" value={data.nutrition.stats.totalWaterLogs} />
                  <StatCard label="Avg Water/Active User" value={data.nutrition.stats.avgWaterLogsPerActiveUser ?? "—"} />
                </div>
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="mb-2 text-xs uppercase tracking-wide text-text-dim">Top logged meals</div>
                {data.nutrition.topMeals.length === 0 ? (
                  <p className="text-xs text-text-dim">No meals logged in this range.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.nutrition.topMeals.map((m) => (
                      <li key={m.name} className="flex items-center justify-between text-sm">
                        <span className="text-text-primary">{m.name}</span>
                        <span className="text-text-secondary">{m.timesLogged}×</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="mb-3 text-xs uppercase tracking-wide text-text-dim">Recovery &amp; AI usage</div>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="AI Messages" value={data.ai.totalMessages} />
                  <StatCard label="Users Using AI" value={data.ai.usersUsingAi} />
                  <StatCard label="Avg / AI User" value={data.ai.avgMessagesPerAiUser ?? "—"} />
                </div>
                <div className="mt-3">
                  <NotAvailablePanel keys={data.notAvailable} subtitle="No wearable/HealthKit integration exists anywhere in this build." />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
