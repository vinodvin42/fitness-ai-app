import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminRefundsResponse, RefundStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { COMMERCE_SUB_NAV } from "./subNav";

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

interface Filters {
  status: RefundStatus | "";
}

interface FormState {
  paymentId: string;
  amountDisplay: string;
  reason: string;
}

const EMPTY_FORM: FormState = { paymentId: "", amountDisplay: "", reason: "" };

async function fetchRefunds(filters: Filters): Promise<AdminRefundsResponse> {
  const res = await apiClient.get<AdminRefundsResponse>("/admin/refunds", {
    params: { status: filters.status || undefined },
  });
  return res.data;
}

/**
 * 06.04 Refunds (docs/admin/03-screen-inventory.md), added 31 Aug 2026 — an
 * admin-initiated refund against a captured Payment. Issued through
 * Razorpay's real refund API when configured (lands `processed`), else
 * recorded `pending`. The payment id comes from the Payments/Transaction
 * screens. See adminRefunds.service.ts.
 */
export function RefundsScreen() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ status: "" });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-refunds", filters],
    queryFn: () => fetchRefunds(filters),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/admin/payments/${form.paymentId.trim()}/refunds`, {
        amountCents: Math.round(Number(form.amountDisplay || "0") * 100),
        reason: form.reason || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
  });

  return (
    <AppShell title="Refunds" subNav={COMMERCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total refunds" value={data.summary.totalCount} />
            <StatCard label="Processed" value={money(data.summary.processedCents)} />
            <StatCard label="Pending" value={money(data.summary.pendingCents)} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={filters.status}
              onChange={(e) => setFilters({ status: e.target.value as Filters["status"] })}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="processed">Processed</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowForm((p) => !p)}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showForm ? "Cancel" : "+ New Refund"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4"
          >
            <p className="text-xs text-text-dim">
              Paste a Payment id (from the Payments screen). The refund goes through Razorpay when configured, otherwise
              it's recorded as pending.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Payment id
                <input
                  required
                  value={form.paymentId}
                  onChange={(e) => setForm((p) => ({ ...p, paymentId: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Amount
                <input
                  required
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={form.amountDisplay}
                  onChange={(e) => setForm((p) => ({ ...p, amountDisplay: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Reason (optional)
              <input
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            {createMutation.isError && (
              <p className="text-xs text-danger">{extractErrorMessage(createMutation.error, "Couldn't issue this refund.")}</p>
            )}
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {createMutation.isPending ? "Processing…" : "Issue Refund"}
            </button>
          </form>
        )}

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load refunds.")}
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
                  <th className="px-4 py-3 font-normal">Amount</th>
                  <th className="px-4 py-3 font-normal">Reason</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.refunds.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{r.userName}</div>
                      <div className="text-xs text-text-dim">{r.userEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {money(r.amountCents)} {r.currency}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{r.reason ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {data.refunds.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-dim">
                      No refunds match these filters.
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
            subtitle="Gateway health telemetry isn't surfaced here — see adminRefunds.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
