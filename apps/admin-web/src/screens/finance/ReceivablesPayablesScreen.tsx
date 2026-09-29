import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { AdminReceivablesPayablesResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

async function fetchReceivablesPayables(): Promise<AdminReceivablesPayablesResponse> {
  const res = await apiClient.get<AdminReceivablesPayablesResponse>("/admin/finance/receivables-payables");
  return res.data;
}

/**
 * 10.05 Receivables & Payables (docs/admin/03-screen-inventory.md §10.05),
 * added 26 Aug 2026. Receivables (aging by days-overdue on `past_due`
 * Subscriptions and `failed` Payments) is fully real. Payables is scoped
 * to unpaid `Expense` rows only — `payablesScope: "expenses_only"` is
 * surfaced directly in the UI copy below rather than left implicit, since
 * coach/influencer payables aren't in it (neither entity exists yet — see
 * adminFinance.service.ts's own doc comment).
 */
export function ReceivablesPayablesScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-finance-receivables-payables"],
    queryFn: fetchReceivablesPayables,
  });

  return (
    <AppShell title={t("receivablesPayables.receivablesPayables")} subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">{t("receivablesPayables.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load receivables & payables.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("receivablesPayables.retry")}
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label={t("receivablesPayables.receivables")} value={money(data.receivablesTotalCents)} hint={`${data.receivables.length} items`} />
              <StatCard label={t("receivablesPayables.payables")} value={money(data.payablesTotalCents)} hint={`${data.payables.length} items — expenses only`} />
              <StatCard label={t("receivablesPayables.netPosition")} value={money(data.netPositionCents)} />
            </div>

            <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
              Payables below covers unpaid Expenses only — coach settlements and influencer payouts aren't in this total, since
              neither has a real entity anywhere in this build yet.
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
                <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
                  {t("receivablesPayables.receivables")}
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-3 py-2 font-normal">{t("receivablesPayables.from")}</th>
                      <th className="px-3 py-2 font-normal">{t("receivablesPayables.amount")}</th>
                      <th className="px-3 py-2 font-normal">{t("receivablesPayables.aging")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.receivables.map((r) => (
                      <tr key={r.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2">
                          <div className="text-text-primary">{r.userFullName}</div>
                          <div className="text-xs text-text-dim">{r.description}</div>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{money(r.amountCents)}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {r.agingBucket} <span className="text-text-dim">({r.daysOverdue}d)</span>
                        </td>
                      </tr>
                    ))}
                    {data.receivables.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-text-dim">
                          {t("receivablesPayables.nothingOutstanding")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
                <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
                  {t("receivablesPayables.payablesExpensesOnly")}
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-3 py-2 font-normal">{t("receivablesPayables.expense")}</th>
                      <th className="px-3 py-2 font-normal">{t("receivablesPayables.amount")}</th>
                      <th className="px-3 py-2 font-normal">{t("receivablesPayables.aging")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payables.map((p) => (
                      <tr key={p.id} className="border-b border-border-subtle last:border-0">
                        <td className="px-3 py-2">
                          <div className="text-text-primary">{p.description}</div>
                          <div className="text-xs capitalize text-text-dim">{p.category.replace(/_/g, " ")}</div>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{money(p.amountCents)}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {p.agingBucket} <span className="text-text-dim">({p.daysOutstanding}d)</span>
                        </td>
                      </tr>
                    ))}
                    {data.payables.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-8 text-center text-text-dim">
                          {t("receivablesPayables.nothingOutstanding")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
