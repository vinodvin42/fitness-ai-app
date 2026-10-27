import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminCouponListResponse, AdminCouponRedemptionsResponse, CouponDiscountType } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { useCan } from "../../lib/permissions";
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
  return type === "percent" ? `${value}% off` : `₹${(value / 100).toFixed(2)} off`;
}

/**
 * 06.05 Coupons (docs/admin/03-screen-inventory.md), added 31 Aug 2026 — the
 * discount-code half of Pricing that used to render as NotAvailablePanel.
 * Real CRUD over the Coupon entity, applied at checkout by the mobile app.
 * Deactivating (not deleting) preserves redemption history. See
 * adminCoupons.service.ts.
 */
export function CouponsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // 27 Oct 2026: the coupon whose redemptions are open below the table.
  const [redemptionsFor, setRedemptionsFor] = useState<string | null>(null);
  // Hide what this role can't do (the API still checks every call).
  const canCreate = useCan("commerce", "create");
  const canEdit = useCan("commerce", "edit");

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
    <AppShell title={t("coupons.coupons")} subNav={COMMERCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t("coupons.total")} value={data.counts.total} />
            <StatCard label={t("coupons.active")} value={data.counts.active} />
            <StatCard label={t("coupons.redemptions")} value={data.counts.totalRedemptions} />
          </div>
        )}

        {canCreate && (
          <div className="flex items-center justify-end rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
            <button
              type="button"
              onClick={() => setShowForm((p) => !p)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
            >
              {showForm ? "Cancel" : "+ New Coupon"}
            </button>
          </div>
        )}

        {canCreate && showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-3 rounded-xl border border-border-subtle bg-surface shadow-xs p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("coupons.code")}
                <input
                  required
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("coupons.descriptionOptional")}
                <input
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("coupons.type")}
                <select
                  value={form.discountType}
                  onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value as CouponDiscountType }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="percent">{t("coupons.percent")}</option>
                  <option value="fixed">{t("coupons.fixedAmount")}</option>
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
                {t("coupons.maxRedemptionsOptional")}
                <input
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm((p) => ({ ...p, maxRedemptions: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("coupons.expiresOptional")}
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

        {isLoading && <p className="text-sm text-text-secondary">{t("coupons.loading")}</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load coupons.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("coupons.retry")}
            </button>
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">{t("coupons.code")}</th>
                  <th className="px-4 py-3 font-normal">{t("coupons.discount")}</th>
                  <th className="px-4 py-3 font-normal">{t("coupons.redemptions")}</th>
                  <th className="px-4 py-3 font-normal">{t("coupons.expires")}</th>
                  <th className="px-4 py-3 font-normal">{t("coupons.status")}</th>
                  <th className="px-4 py-3 font-normal">{t("coupons.action")}</th>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRedemptionsFor((cur) => (cur === c.id ? null : c.id))}
                          aria-expanded={redemptionsFor === c.id}
                          className={`rounded-md border px-2.5 py-1 text-xs ${
                            redemptionsFor === c.id
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border-subtle text-text-secondary hover:border-accent hover:text-accent"
                          }`}
                        >
                          {t("coupons.viewRedemptions")}
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })}
                            disabled={toggleMutation.isPending}
                            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                          >
                            {c.isActive ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.coupons.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-dim">
                      {t("coupons.noCouponsYet")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {redemptionsFor && <CouponRedemptions couponId={redemptionsFor} onClose={() => setRedemptionsFor(null)} />}
      </div>
    </AppShell>
  );
}

const PURPOSE_LABELS: Record<string, string> = { subscription: "Subscription", program_purchase: "Program purchase", booking: "Coach session" };

function rupees(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * Who redeemed a coupon (27 Oct 2026) — read-only, from
 * GET /admin/coupons/:id/redemptions: the member, the discount and the
 * payment it was applied to.
 */
function CouponRedemptions({ couponId, onClose }: { couponId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-coupon-redemptions", couponId],
    queryFn: async () => (await apiClient.get<AdminCouponRedemptionsResponse>(`/admin/coupons/${couponId}/redemptions`)).data,
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-text-dim">
          {data ? t("coupons.redemptionsOf", { code: data.coupon.code }) : t("coupons.redemptions")}
        </div>
        <button type="button" onClick={onClose} className="text-xs text-text-secondary hover:text-text-primary">
          {t("coupons.close")}
        </button>
      </div>
      {isLoading && <p className="px-4 py-6 text-sm text-text-secondary">{t("coupons.loading")}</p>}
      {isError && (
        <p className="px-4 py-6 text-sm text-danger">{extractErrorMessage(error, t("coupons.redemptionsLoadError"))}</p>
      )}
      {data && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
              <th className="px-4 py-3 font-normal">{t("coupons.member")}</th>
              <th className="px-4 py-3 font-normal">{t("coupons.discount")}</th>
              <th className="px-4 py-3 font-normal">{t("coupons.payment")}</th>
              <th className="px-4 py-3 font-normal">{t("coupons.redeemed")}</th>
            </tr>
          </thead>
          <tbody>
            {data.redemptions.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/users/${r.userId}`} className="font-medium text-text-primary hover:text-accent hover:underline">
                    {r.userFullName}
                  </Link>
                  <div className="text-xs text-text-dim">{r.userEmail}</div>
                </td>
                <td className="px-4 py-3 text-text-secondary">{rupees(r.discountCents)}</td>
                <td className="px-4 py-3 text-text-secondary">
                  {r.payment ? (
                    <div className="flex items-center gap-2">
                      <Link to={`/commerce/${r.payment.id}`} className="text-accent hover:underline">
                        {rupees(r.payment.amountCents)} · {PURPOSE_LABELS[r.payment.purpose] ?? r.payment.purpose}
                      </Link>
                      <StatusBadge status={r.payment.status} />
                    </div>
                  ) : (
                    <span className="text-text-dim">{t("coupons.noPayment")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">{new Date(r.redeemedAt).toLocaleString()}</td>
              </tr>
            ))}
            {data.redemptions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-dim">
                  {t("coupons.noRedemptionsYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
