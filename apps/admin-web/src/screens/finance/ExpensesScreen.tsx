import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminExpenseListResponse, ExpenseCategory, ExpenseStatus } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  coach_settlement: "Coach Settlement",
  influencer_payout: "Influencer Payout",
  gateway_fee: "Gateway Fee",
  ops: "Ops",
  marketing: "Marketing",
  refund: "Refund",
  other: "Other",
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as ExpenseCategory[];

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

interface Filters {
  category: ExpenseCategory | "";
  status: ExpenseStatus | "";
}

interface FormState {
  category: ExpenseCategory;
  description: string;
  amountDisplay: string;
  incurredAt: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  category: "ops",
  description: "",
  amountDisplay: "0.00",
  incurredAt: new Date().toISOString().slice(0, 10),
  notes: "",
};

async function fetchExpenses(filters: Filters): Promise<AdminExpenseListResponse> {
  const res = await apiClient.get<AdminExpenseListResponse>("/admin/finance/expenses", {
    params: { category: filters.category || undefined, status: filters.status || undefined },
  });
  return res.data;
}

function formToPayload(form: FormState) {
  return {
    category: form.category,
    description: form.description,
    amountCents: Math.round(Number(form.amountDisplay || "0") * 100),
    incurredAt: form.incurredAt,
    notes: form.notes || undefined,
  };
}

/**
 * 10.03 Expenses & Payouts (docs/admin/03-screen-inventory.md §10.03),
 * added 26 Aug 2026. The Expenses half is real CRUD over the new
 * `Expense` entity — a legitimate manual fact ("we spent $X on Y"), not a
 * reconciliation claim. The Payouts half (coach settlements, influencer
 * payouts) renders via `NotAvailablePanel` — see adminFinance.service.ts's
 * own doc comment for why neither entity is modeled at all yet.
 */
export function ExpensesScreen() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ category: "", status: "" });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-finance-expenses", filters],
    queryFn: () => fetchExpenses(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin-finance-expenses"] });

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) => apiClient.post("/admin/finance/expenses", payload),
    onSuccess: () => {
      invalidateAll();
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/finance/expenses/${id}/mark-paid`),
    onSuccess: invalidateAll,
  });

  return (
    <AppShell title="Expenses & Payouts" subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={money(data.summary.totalCents)} hint={`${data.summary.totalCount} expenses`} />
            <StatCard label="Pending" value={money(data.summary.pendingCents)} />
            <StatCard label="Paid" value={money(data.summary.paidCents)} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Category
            <select
              value={filters.category}
              onChange={(e) => setFilter("category", e.target.value as Filters["category"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showForm ? "Cancel" : "+ Record Expense"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(formToPayload(form));
            }}
            className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4"
          >
            <div className="text-sm font-medium">Record Expense</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as ExpenseCategory }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Amount
                <input
                  required
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={form.amountDisplay}
                  onChange={(e) => setForm((prev) => ({ ...prev, amountDisplay: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Description
              <input
                required
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Incurred on
                <input
                  required
                  type="date"
                  value={form.incurredAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, incurredAt: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Notes (optional)
                <input
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            {createMutation.isError && (
              <p className="text-xs text-danger">{extractErrorMessage(createMutation.error, "Couldn't save this expense.")}</p>
            )}
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {createMutation.isPending ? "Saving…" : "Record Expense"}
            </button>
          </form>
        )}

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load expenses.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {markPaidMutation.isError && (
          <p className="text-xs text-danger">{extractErrorMessage(markPaidMutation.error, "That action didn't go through.")}</p>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Description</th>
                  <th className="px-4 py-3 font-normal">Category</th>
                  <th className="px-4 py-3 font-normal">Amount</th>
                  <th className="px-4 py-3 font-normal">Incurred</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Recorded by</th>
                  <th className="px-4 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((e) => (
                  <tr key={e.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{e.description}</div>
                      {e.notes && <div className="text-xs text-text-dim">{e.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{CATEGORY_LABELS[e.category]}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {money(e.amountCents)} {e.currency}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(e.incurredAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{e.recordedByAdminName}</td>
                    <td className="px-4 py-3">
                      {e.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => markPaidMutation.mutate(e.id)}
                          disabled={markPaidMutation.isPending}
                          className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.expenses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim">
                      No expenses match these filters.
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
            subtitle="Neither entity exists anywhere in this build yet — see adminFinance.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
