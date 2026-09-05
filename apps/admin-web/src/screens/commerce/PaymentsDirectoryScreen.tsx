import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminPaymentDirectoryResponse, PaymentPurpose, PaymentStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { COMMERCE_SUB_NAV } from "./subNav";

const PURPOSE_LABELS: Record<string, string> = { subscription: "Subscription", program_purchase: "Program purchase" };

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

interface Filters {
  status: PaymentStatus | "";
  purpose: PaymentPurpose | "";
  search: string;
  startDate: string;
  endDate: string;
}

async function fetchDirectory(filters: Filters): Promise<AdminPaymentDirectoryResponse> {
  const res = await apiClient.get<AdminPaymentDirectoryResponse>("/admin/payments", {
    params: {
      status: filters.status || undefined,
      purpose: filters.purpose || undefined,
      search: filters.search || undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    },
  });
  return res.data;
}

/**
 * 06.03 Payments (docs/admin/03-screen-inventory.md §06.03), added 22 Aug
 * 2026 — a console-wide, filterable view over the real `Payment` model
 * (Phase 6's Razorpay integration), the first admin screen to show every
 * user's payments together rather than one user's own Payments tab
 * (Module 02's User Profile). Real Status/Purpose filters, a createdAt
 * date range, and a search box (provider order/payment id, or the paying
 * user's name/email). The KPI row and the spec'd-but-missing "gateway
 * health indicator" — see apps/api's adminPayments.service.ts for the
 * full real-vs-not breakdown, including why 06.01/06.04/06.05 aren't
 * built this pass. Row click drills into 06.02 Transaction detail at
 * `/commerce/:id`, same Directory→Detail shape as Relationships/Users.
 *
 * **25 Aug 2026:** now shares `COMMERCE_SUB_NAV` with 06.05 Pricing, the
 * module's second nav-level screen — see `screens/commerce/subNav.ts`.
 */
export function PaymentsDirectoryScreen() {
  const [filters, setFilters] = useState<Filters>({ status: "", purpose: "", search: "", startDate: "", endDate: "" });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-payments", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <AppShell title="Payments" subNav={COMMERCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Total Payments" value={data.summary.totalCount} />
            <StatCard label="Captured Revenue" value={`${money(data.summary.capturedRevenueCents)}`} hint="Sum of Paid amounts, current filter scope" />
            <StatCard label="Failed" value={data.summary.failedCount} />
            <StatCard
              label="Success Rate"
              value={data.summary.successRate == null ? "—" : `${Math.round(data.summary.successRate * 100)}%`}
            />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="created">Created</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Purpose
            <select
              value={filters.purpose}
              onChange={(e) => setFilter("purpose", e.target.value as Filters["purpose"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="subscription">Subscription</option>
              <option value="program_purchase">Program purchase</option>
            </select>
          </label>

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

          <label className="ml-auto flex flex-col gap-1 text-xs text-text-dim">
            Search
            <input
              type="search"
              placeholder="User, order id, payment id…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className="w-64 rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load payments.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">User</th>
                  <th className="px-4 py-3 font-normal">Purchased</th>
                  <th className="px-4 py-3 font-normal">Amount</th>
                  <th className="px-4 py-3 font-normal">Provider</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Date</th>
                  <th className="px-4 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{p.userFullName}</div>
                      <div className="text-xs text-text-dim">{p.userEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-text-secondary">{p.referenceLabel ?? p.referenceId}</div>
                      <div className="text-xs text-text-dim">{PURPOSE_LABELS[p.purpose] ?? p.purpose}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {money(p.amountCents)} {p.currency}
                    </td>
                    <td className="px-4 py-3 capitalize text-text-secondary">{p.provider}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link to={`/commerce/${p.id}`} className="text-xs text-accent hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.payments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim">
                      No payments match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle="No backing data exists yet for this Figma-spec'd field — see adminPayments.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
