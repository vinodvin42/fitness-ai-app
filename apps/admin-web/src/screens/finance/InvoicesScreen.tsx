import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { AdminInvoiceListResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

interface Filters {
  search: string;
  startDate: string;
  endDate: string;
}

async function fetchInvoices(filters: Filters): Promise<AdminInvoiceListResponse> {
  const res = await apiClient.get<AdminInvoiceListResponse>("/admin/finance/invoices", {
    params: {
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    },
  });
  return res.data;
}

/**
 * 10.04 Invoices (docs/admin/03-screen-inventory.md §10.04), added 26 Aug
 * 2026 — real, but read-only: every row is generated automatically the
 * moment a `Payment` flips to "paid" (`payments.service.ts`'s
 * `activatePayment()` → `ensureInvoiceForPayment()`), so there's no
 * manual "create invoice" action here, unlike Expenses. This is a
 * consumer subscription app, not a B2B biller — every invoice traces
 * back to exactly one real, gateway-verified Payment.
 */
export function InvoicesScreen() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({ search: "", startDate: "", endDate: "" });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-finance-invoices", filters],
    queryFn: () => fetchInvoices(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <AppShell title={t("invoices.invoices")} subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={t("invoices.totalInvoices")} value={data.summary.totalCount} />
            <StatCard label={t("invoices.totalAmount")} value={money(data.summary.totalCents)} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("invoices.from")}
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
          <label className="ml-auto flex flex-col gap-1 text-xs text-text-dim">
            {t("invoices.search")}
            <input
              type="search"
              placeholder={t("invoices.invoiceNumberUser")}
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-64 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">{t("invoices.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load invoices.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("invoices.retry")}
            </button>
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">{t("invoices.invoice")}</th>
                  <th className="px-4 py-3 font-normal">{t("invoices.user")}</th>
                  <th className="px-4 py-3 font-normal">{t("invoices.amount")}</th>
                  <th className="px-4 py-3 font-normal">{t("invoices.issued")}</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{inv.number}</td>
                    <td className="px-4 py-3">
                      <div className="text-text-secondary">{inv.userFullName}</div>
                      <div className="text-xs text-text-dim">{inv.userEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{money(inv.amountCents)}</td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(inv.issuedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {data.invoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-text-dim">
                      {t("invoices.noInvoicesMatchThese")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
