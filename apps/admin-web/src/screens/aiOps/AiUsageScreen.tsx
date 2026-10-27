import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdminAiUsageResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { AI_OPS_SUB_NAV } from "./subNav";

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

const CHART_AXIS = { stroke: "#5b6472", fontSize: 11, tickLine: false, axisLine: false } as const;
const CHART_TOOLTIP = {
  contentStyle: { background: "#161b22", border: "1px solid #232a33", borderRadius: 8 },
  labelStyle: { color: "#f5f7fa" },
} as const;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

async function fetchUsage(days: Window): Promise<AdminAiUsageResponse> {
  const res = await apiClient.get<AdminAiUsageResponse>("/admin/ai-ops/usage", { params: { days } });
  return res.data;
}

/**
 * 11.02 AI Usage & Metrics (docs/admin/03-screen-inventory.md §11.02), Oct
 * 2026 — real usage of AI Coach chat, the one AI capability in this build
 * (GET /admin/ai-ops/usage; see getAiUsage in adminAiOps.service.ts).
 * Aggregates only: no user names or message text appear here.
 *
 * "Unanswered" are questions whose reply failed and hasn't been retried
 * successfully. "Personalised" replies used the person's own data (goals,
 * recent workouts…), what the app's "Why this?" sheet shows. Tokens, cost
 * and latency aren't stored per reply, so they're listed as not available
 * rather than estimated.
 */
export function AiUsageScreen() {
  const [days, setDays] = useState<Window>(30);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-ai-usage", days],
    queryFn: () => fetchUsage(days),
  });

  return (
    <AppShell title="AI Usage" subNav={AI_OPS_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-border-subtle bg-surface p-0.5" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={days === w}
                onClick={() => setDays(w)}
                className={`rounded px-3 py-1 text-xs ${days === w ? "bg-accent text-canvas" : "text-text-secondary hover:text-text-primary"}`}
              >
                Last {w} days
              </button>
            ))}
          </div>
          {data && (
            <span className="text-xs text-text-dim">
              AI Coach is {data.enabled ? "on" : "off"} · {data.provider.provider} ({data.provider.model})
              {data.provider.configured ? "" : " — not configured on this server"}
            </span>
          )}
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load AI usage.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Questions asked" value={data.totals.questions} />
              <StatCard label="Answers given" value={data.totals.answered} />
              <StatCard label="Unanswered" value={`${data.totals.unanswered} (${pct(data.totals.unansweredRate)})`} hint="Reply failed and not yet retried successfully" />
              <StatCard label="People who asked" value={data.totals.activeUsers} hint={`${data.totals.usersEver} ${data.totals.usersEver === 1 ? "person has" : "people have"} ever used AI Coach`} />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Personalised answers" value={pct(data.totals.personalisedRate)} hint="Used the person's own goals, workouts or measurements" />
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
              <div className="mb-2 text-sm font-medium">Questions and answers per day</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.series}>
                    <XAxis dataKey="date" tickFormatter={(v) => shortDate(String(v))} {...CHART_AXIS} />
                    <YAxis allowDecimals={false} width={28} {...CHART_AXIS} />
                    <Tooltip {...CHART_TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
                    <Line type="monotone" dataKey="questions" name="Questions" stroke="#12e5a6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="answered" name="Answers" stroke="#5aa9ff" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="unanswered" name="Unanswered" stroke="#ff6b6b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
              <div className="mb-2 text-sm font-medium">People asking per day</div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.series}>
                    <XAxis dataKey="date" tickFormatter={(v) => shortDate(String(v))} {...CHART_AXIS} />
                    <YAxis allowDecimals={false} width={28} {...CHART_AXIS} />
                    <Tooltip {...CHART_TOOLTIP} labelFormatter={(v) => shortDate(String(v))} />
                    <Line type="monotone" dataKey="activeUsers" name="People" stroke="#12e5a6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <NotAvailablePanel keys={data.notAvailable} subtitle="Not stored per reply, so not shown rather than estimated." />
          </>
        )}
      </div>
    </AppShell>
  );
}
