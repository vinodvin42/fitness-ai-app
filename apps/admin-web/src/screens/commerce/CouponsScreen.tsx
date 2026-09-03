import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCouponListResponse, CouponDiscountType } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { COMMERCE_SUB_NAV } from "./subNav";

interface FormState {
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValueDisplay: string;
  maxRedemptions: string;
  expiresAt: string;
}

const EMPTY_FORM: FormState = {
  code: "",
  description: "",
  discountType: "percent",
  discountValueDisplay: "10",
  maxRedemptions: "",
  expiresAt: "",
};

async function fetchCoupons(): Promise<AdminCouponListResponse> {
  const res = await apiClient.get<AdminCouponListResponse>("/admin/coupons");
  return res.data;
}

function describeDiscount(type: CouponDiscountType, value: number): string {
  return type === "percent" ? `${value}% off` : `${(value / 100).toFixed(2)} off`;
}

/**
 * 06.05 Coupons (docs/admin/03-screen-inventory.md), added 31 Aug 2026 — the
 * discount-code half of Pricing that used to render as NotAvailablePanel.
 * Real CRUD over the Coupon entity, applied at checkout by the mobile app.
 * Deactivating (not deleting) preserves redemption history. See
 * adminCoupons.service.ts.
 */
export function CouponsScreen() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: fetchCoupons,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/admin/coupons", {
        code: form.code,
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue:
          form.discountType === "percent"
            ? Math.round(Number(form.discountValueDisplay || "0"))
            : Math.round(Number(form.discountValueDisplay || "0") * 100),
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/admin/coupons/${id}`, { isActive }),
    onSuccess: invalidate,
  });

  return (
    <AppShell title="Coupons" subNav={COMMERCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={data.counts.total} />
            <StatCard label="Active" value={data.counts.active} />
            <StatCard label="Redemptions" value={data.counts.totalRedemptions} />
          </div>
        )}

        <div className="flex items-center justify-end rounded-lg border border-border-subtle bg-surface p-4">
          <button
            type="button"
            onClick={() => setShowForm((p) => !p)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showForm ? "Cancel" : "+ New Coupon"}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Code
                <input
                  required
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Description (optional)
                <input
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Type
                <select
                  value={form.discountType}
                  onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value as CouponDiscountType }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="percent">Percent %</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {form.discountType === "percent" ? "Percent off" : "Amount off"}
                <input
                  required
                  type="number"
                  min={form.discountType === "percent" ? 1 : 0.01}
                  step={form.discountType === "percent" ? 1 : 0.01}
                  value={form.discountValueDisplay}
                  onChange={(e) => setForm((p) => ({ ...p, discountValueDisplay: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Max redemptions (optional)
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm((p) => ({ ...p, maxRedemptions: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Expires (optional)
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            {createMutation.isError && (
              <p className="text-xs text-danger">{extractErrorMessage(createMutation.error, "Couldn't create this coupon.")}</p>
            )}
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {createMutation.isPending ? "Saving…" : "Create Coupon"}
            </button>
          </form>
        )}

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load coupons.")}
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
                  <th className="px-4 py-3 font-normal">Code</th>
                  <th className="px-4 py-3 font-normal">Discount</th>
                  <th className="px-4 py-3 font-normal">Redemptions</th>
                  <th className="px-4 py-3 font-normal">Expires</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.coupons.map((c) => (
                  <tr key={c.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{c.code}</div>
                      {c.description && <div className="text-xs text-text-dim">{c.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{describeDiscount(c.discountType, c.discountValue)}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.timesRedeemed}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.isActive ? "active" : "archived"} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })}
                        disabled={toggleMutation.isPending}
                        className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                      >
                        {c.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.coupons.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-dim">
                      No coupons yet.
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
