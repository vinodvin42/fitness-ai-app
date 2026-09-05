import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminFinancialReportsResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

type Tab = "pnl" | "cashFlow" | "revenue" | "expense";
const TABS: { key: Tab; label: string }[] = [
  { key: "pnl", label: "P&L" },
  { key: "cashFlow", label: "Cash Flow" },
  { key: "revenue", label: "Revenue" },
  { key: "expense", label: "Expense" },
];

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  coach_settlement: "Coach Settlement",
  influencer_payout: "Influencer Payout",
  gateway_fee: "Gateway Fee",
  ops: "Ops",
  marketing: "Marketing",
  refund: "Refund",
  other: "Other",
};

async function fetchReports(): Promise<AdminFinancialReportsResponse> {
  const res = await apiClient.get<AdminFinancialReportsResponse>("/admin/finance/reports");
  return res.data;
}

/**
 * 10.10 Financial Reports (docs/admin/03-screen-inventory.md §10.10),
 * added 26 Aug 2026 — the 4-tab (P&L/Cash Flow/Revenue/Expense) view the
 * Figma spec calls for, re-aggregating 10.01/10.02/10.03's already-real
 * data. No new computation of its own — same "packaging, not new data"
 * shape 09.03 Fitness & Nutrition was planned as a follow-up on 09.01.
 */
export function FinancialReportsScreen() {
  const [tab, setTab] = useState<Tab>("pnl");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-finance-reports"],
    queryFn: fetchReports,
  });

  return (
    <AppShell title="Financial Reports" subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
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

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load financial reports.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && tab === "pnl" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Revenue" value={money(data.profitAndLoss.revenueCents)} />
              <StatCard label="Expenses" value={money(data.profitAndLoss.expensesCents)} />
              <StatCard label="Net Profit" value={money(data.profitAndLoss.netProfitCents)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Net Margin" value={data.ratios.netMarginPct === null ? "—" : `${data.ratios.netMarginPct}%`} />
              <StatCard
                label="Expense / Revenue"
                value={data.ratios.expenseToRevenuePct === null ? "—" : `${data.ratios.expenseToRevenuePct}%`}
              />
            </div>
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
                Expenses by category
              </div>
              <table className="w-full text-left text-sm">
                <tbody>
                  {Object.entries(data.profitAndLoss.expensesByCategory).map(([cat, cents]) => (
                    <tr key={cat} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-2 text-text-secondary">{CATEGORY_LABELS[cat] ?? cat}</td>
                      <td className="px-4 py-2 text-right text-text-primary">{money(cents)}</td>
                    </tr>
                  ))}
                  {Object.keys(data.profitAndLoss.expensesByCategory).length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-text-dim">No expenses recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data && tab === "cashFlow" && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Month</th>
                  <th className="px-4 py-3 font-normal">Inflow</th>
                  <th className="px-4 py-3 font-normal">Outflow</th>
                  <th className="px-4 py-3 font-normal">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.cashFlow.map((m) => (
                  <tr key={m.month} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 text-text-primary">{m.month}</td>
                    <td className="px-4 py-3 text-text-secondary">{money(m.inflowCents)}</td>
                    <td className="px-4 py-3 text-text-secondary">{money(m.outflowCents)}</td>
                    <td className="px-4 py-3 text-text-secondary">{money(m.netCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && tab === "revenue" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Subscriptions" value={money(data.revenue.byPurpose.subscriptionCents)} />
              <StatCard label="Program Purchases" value={money(data.revenue.byPurpose.programPurchaseCents)} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">Plan</th>
                    <th className="px-4 py-3 font-normal">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenue.byPlan.map((p) => (
                    <tr key={p.planId} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-text-primary">{p.planName}</td>
                      <td className="px-4 py-3 text-text-secondary">{money(p.revenueCents)}</td>
                    </tr>
                  ))}
                  {data.revenue.byPlan.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-text-dim">
                        No subscription revenue yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data && tab === "expense" && (
          <div className="space-y-4">
            <StatCard label="Total Expenses" value={money(data.expense.totalCents)} />
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <tbody>
                  {Object.entries(data.expense.byCategory).map(([cat, cents]) => (
                    <tr key={cat} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-2 text-text-secondary">{CATEGORY_LABELS[cat] ?? cat}</td>
                      <td className="px-4 py-2 text-right text-text-primary">{money(cents)}</td>
                    </tr>
                  ))}
                  {Object.keys(data.expense.byCategory).length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-text-dim">No expenses recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data && (
          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle="No backing data exists yet for this Figma-spec'd field — see adminFinance.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
