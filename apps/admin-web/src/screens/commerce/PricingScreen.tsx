import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminPlanDirectoryResponse, AdminPlanListItem, BillingCycle, SubscriptionTier } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { COMMERCE_SUB_NAV } from "./subNav";

const TIER_LABELS: Record<SubscriptionTier, string> = { basic: "Basic", pro: "Pro", elite: "Elite" };
const TIER_OPTIONS: SubscriptionTier[] = ["basic", "pro", "elite"];
const CYCLE_LABELS: Record<BillingCycle, string> = { monthly: "Monthly", annual: "Annual" };

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

interface Filters {
  tier: SubscriptionTier | "";
  billingCycle: BillingCycle | "";
  status: "active" | "archived" | "";
}

interface FormState {
  name: string;
  tier: SubscriptionTier;
  billingCycle: BillingCycle;
  priceDisplay: string;
}

const EMPTY_FORM: FormState = { name: "", tier: "basic", billingCycle: "monthly", priceDisplay: "0.00" };

async function fetchDirectory(filters: Filters): Promise<AdminPlanDirectoryResponse> {
  const res = await apiClient.get<AdminPlanDirectoryResponse>("/admin/plans", {
    params: {
      tier: filters.tier || undefined,
      billingCycle: filters.billingCycle || undefined,
      status: filters.status || undefined,
    },
  });
  return res.data;
}

function formToPayload(form: FormState) {
  return {
    name: form.name,
    tier: form.tier,
    billingCycle: form.billingCycle,
    priceCents: Math.round(Number(form.priceDisplay || "0") * 100),
  };
}

/**
 * 06.05 Pricing (docs/admin/03-screen-inventory.md §06.05), added 25 Aug
 * 2026 — the Plans half of "a plans table and a separate coupons table."
 * The first screen anywhere in this build that can create, edit, or
 * retire a `SubscriptionPlan` row — before this, every plan was
 * `scripts/seed.ts`-only. Shares `COMMERCE_SUB_NAV` with 06.03 Payments.
 *
 * Archive/Reactivate is a reversible `isActive` flip, not a delete — see
 * `SubscriptionPlan.isActive`'s own doc comment in `prisma/schema.prisma`
 * for why (deleting a plan referenced by real Subscription/Payment rows
 * would break historical data). An archived plan stops being offered to
 * new subscribers (`apps/api/src/modules/subscriptions`'s `listPlans()`
 * now filters to `isActive: true`) but anyone already on it is untouched.
 *
 * **Coupons are honestly not built** — no `Coupon` entity exists anywhere
 * (no discount-code field in the checkout flow to apply one against) — see
 * `adminPlans.service.ts`'s own doc comment for the full reasoning.
 */
export function PricingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ tier: "", billingCycle: "", status: "" });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-plans", filters],
    queryFn: () => fetchDirectory(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["admin-plans"] });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof formToPayload>) => apiClient.post("/admin/plans", payload),
    onSuccess: () => {
      invalidateAll();
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof formToPayload> }) =>
      apiClient.patch(`/admin/plans/${id}`, payload),
    onSuccess: () => {
      invalidateAll();
      closeForm();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/plans/${id}/archive`),
    onSuccess: invalidateAll,
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/plans/${id}/reactivate`),
    onSuccess: invalidateAll,
  });

  function startEdit(p: AdminPlanListItem) {
    setEditingId(p.id);
    setForm({ name: p.name, tier: p.tier, billingCycle: p.billingCycle, priceDisplay: (p.priceCents / 100).toFixed(2) });
    setShowForm(true);
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm((prev) => !prev);
  }

  const savePending = createMutation.isPending || updateMutation.isPending;
  const saveError = createMutation.error ?? updateMutation.error;
  const toggleError = archiveMutation.error ?? reactivateMutation.error;

  return (
    <AppShell title={t("pricing.pricing")} subNav={COMMERCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t("pricing.totalPlans")} value={data.counts.total} />
            <StatCard label={t("pricing.active")} value={data.counts.active} />
            <StatCard label={t("pricing.archived")} value={data.counts.archived} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("pricing.tier")}
            <select
              value={filters.tier}
              onChange={(e) => setFilter("tier", e.target.value as Filters["tier"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("pricing.all")}</option>
              {TIER_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("pricing.billingCycle")}
            <select
              value={filters.billingCycle}
              onChange={(e) => setFilter("billingCycle", e.target.value as Filters["billingCycle"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("pricing.all")}</option>
              <option value="monthly">{t("pricing.monthly")}</option>
              <option value="annual">{t("pricing.annual")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("pricing.status")}
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            >
              <option value="">{t("pricing.all")}</option>
              <option value="active">{t("pricing.active")}</option>
              <option value="archived">{t("pricing.archived")}</option>
            </select>
          </label>

          <button
            type="button"
            onClick={startCreate}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showForm && !editingId ? "Cancel" : "+ Create Plan"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const payload = formToPayload(form);
              if (editingId) updateMutation.mutate({ id: editingId, payload });
              else createMutation.mutate(payload);
            }}
            className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{editingId ? "Edit Plan" : "Create Plan"}</div>
              {editingId && (
                <button type="button" onClick={closeForm} className="text-xs text-text-dim hover:text-text-primary">
                  {t("pricing.cancel")}
                </button>
              )}
            </div>
            {!editingId && (
              <p className="text-xs text-text-secondary">
                {t("pricing.newPlansAreActive")}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("pricing.name")}
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("pricing.tier")}
                <select
                  value={form.tier}
                  onChange={(e) => setForm((prev) => ({ ...prev, tier: e.target.value as SubscriptionTier }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  {TIER_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("pricing.billingCycle")}
                <select
                  value={form.billingCycle}
                  onChange={(e) => setForm((prev) => ({ ...prev, billingCycle: e.target.value as BillingCycle }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="monthly">{t("pricing.monthly")}</option>
                  <option value="annual">{t("pricing.annual")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                {t("pricing.priceUsd")}
                <input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceDisplay}
                  onChange={(e) => setForm((prev) => ({ ...prev, priceDisplay: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            {saveError && <p className="text-xs text-danger">{extractErrorMessage(saveError, "Couldn't save this plan.")}</p>}
            <button
              type="submit"
              disabled={savePending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {savePending ? "Saving…" : editingId ? "Save Changes" : "Create Plan"}
            </button>
          </form>
        )}

        {isLoading && <p className="text-sm text-text-secondary">{t("pricing.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load plans.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("pricing.retry")}
            </button>
          </div>
        )}

        {toggleError && <p className="text-xs text-danger">{extractErrorMessage(toggleError, "That action didn't go through.")}</p>}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">{t("pricing.name")}</th>
                  <th className="px-4 py-3 font-normal">{t("pricing.tier")}</th>
                  <th className="px-4 py-3 font-normal">{t("pricing.price")}</th>
                  <th className="px-4 py-3 font-normal">{t("pricing.billing")}</th>
                  <th className="px-4 py-3 font-normal">{t("pricing.status")}</th>
                  <th className="px-4 py-3 font-normal">{t("pricing.subscribers")}</th>
                  <th className="px-4 py-3 font-normal">{t("pricing.updated")}</th>
                  <th className="px-4 py-3 font-normal">{t("pricing.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.plans.map((p) => (
                  <tr key={p.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{p.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{TIER_LABELS[p.tier]}</td>
                    <td className="px-4 py-3 text-text-secondary">{money(p.priceCents)}</td>
                    <td className="px-4 py-3 text-text-secondary">{CYCLE_LABELS[p.billingCycle]}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.isActive ? "active" : "archived"} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{p.subscriberCount}</td>
                    <td className="px-4 py-3 text-text-secondary">{new Date(p.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                        >
                          {t("pricing.edit")}
                        </button>
                        {p.isActive ? (
                          <button
                            type="button"
                            onClick={() => archiveMutation.mutate(p.id)}
                            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-danger hover:text-danger"
                          >
                            {t("pricing.archive")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => reactivateMutation.mutate(p.id)}
                            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                          >
                            {t("pricing.reactivate")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.plans.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-text-dim">
                      {t("pricing.noPlansMatchThese")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <NotAvailablePanel keys={data.notAvailable} subtitle={t("pricing.noCouponEntityExists")} />
        )}
      </div>
    </AppShell>
  );
}
