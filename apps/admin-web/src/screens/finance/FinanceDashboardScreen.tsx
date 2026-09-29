import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdminFinanceDashboardResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

const CHART_AXIS = { stroke: "#5b6472", fontSize: 11, tickLine: false, axisLine: false } as const;
const CHART_TOOLTIP = {
  contentStyle: { background: "#161b22", border: "1px solid #232a33", borderRadius: 8 },
  labelStyle: { color: "#f5f7fa" },
} as const;

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

async function fetchDashboard(): Promise<AdminFinanceDashboardResponse> {
  const res = await apiClient.get<AdminFinanceDashboardResponse>("/admin/finance/dashboard");
  return res.data;
}

/**
 * 10.01 Finance Dashboard ("Financial Command Center") — the first of
 * Module 10's 7 real screens, added 26 Aug 2026 directly from the
 * architecture decision recorded in reports/finance-architecture-plan.html.
 * KPI row and the 6-month cash flow snapshot are real aggregation over
 * `Payment`/`Expense` (MTD = calendar month to date). Of the spec'd
 * "Required Financial Actions" list, overdue receivables and (as of 6 Sep
 * 2026) open refund requests are real — pending coach settlements/
 * influencer payouts still stay `notAvailable`, see adminFinance.service.ts's
 * own doc comment for why.
 */
export function FinanceDashboardScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-finance-dashboard"],
    queryFn: fetchDashboard,
  });

  return (
    <AppShell title={t("financeDashboard.financeDashboard")} subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">{t("financeDashboard.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load the Finance dashboard.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("financeDashboard.retry")}
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label={t("financeDashboard.revenueMtd")} value={money(data.kpis.revenueMtdCents)} />
              <StatCard label={t("financeDashboard.expensesMtd")} value={money(data.kpis.expensesMtdCents)} />
              <StatCard
                label={t("financeDashboard.netProfitMtd")}
                value={money(data.kpis.netProfitMtdCents)}
                hint={data.kpis.netProfitMtdCents < 0 ? "Running at a loss this month" : undefined}
              />
              <StatCard label={t("financeDashboard.accountsReceivable")} value={money(data.kpis.accountsReceivableCents)} />
              <StatCard label={t("financeDashboard.accountsPayable")} value={money(data.kpis.accountsPayableCents)} hint="Expenses only — see below" />
              <StatCard label={t("financeDashboard.cashBalance")} value={money(data.kpis.cashBalanceCents)} hint="All-time paid revenue minus paid expenses" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatCard
                label={t("financeDashboard.burnRateAvgMo")}
                value={data.burnRateCents === null ? "—" : money(data.burnRateCents)}
                hint={data.burnRateCents === null ? "Net cash flow hasn't been negative on average" : undefined}
              />
              <StatCard
                label={t("financeDashboard.runway")}
                value={data.runwayMonths === null ? "—" : `${data.runwayMonths} mo`}
                hint={data.runwayMonths === null ? "No sustained burn to project against" : "Cash balance ÷ burn rate"}
              />
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="mb-3 text-xs uppercase tracking-wide text-text-dim">{t("financeDashboard.cashFlowTrailing6")}</div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.cashFlow}>
                    <XAxis dataKey="month" {...CHART_AXIS} />
                    <YAxis {...CHART_AXIS} tickFormatter={(v) => `${Math.round(v / 100)}`} />
                    <Tooltip {...CHART_TOOLTIP} formatter={(v) => money(Number(v))} />
                    <Line type="monotone" dataKey="inflowCents" stroke="#3fb950" strokeWidth={2} dot={false} name="Inflow" />
                    <Line type="monotone" dataKey="outflowCents" stroke="#f85149" strokeWidth={2} dot={false} name="Outflow" />
                    <Line type="monotone" dataKey="netCents" stroke="#58a6ff" strokeWidth={2} dot={false} name="Net" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="mb-3 text-xs uppercase tracking-wide text-text-dim">{t("financeDashboard.requiredFinancialActions")}</div>
              <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm">
                <span className="text-text-secondary">{t("financeDashboard.overdueReceivables")}</span>
                <span className="text-text-primary">
                  {data.requiredActions.overdueReceivables.count} · {money(data.requiredActions.overdueReceivables.amountCents)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm">
                <span className="text-text-secondary">{t("financeDashboard.openRefundRequests")}</span>
                <span className="text-text-primary">{data.requiredActions.openRefundRequests}</span>
              </div>
            </div>

            <NotAvailablePanel
              keys={data.notAvailable}
              subtitle={t("financeDashboard.noBackingDataExists")}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
