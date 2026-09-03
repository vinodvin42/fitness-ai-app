import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminTaxConfigListResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

interface FormState {
  jurisdiction: string;
  ratePercent: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { jurisdiction: "", ratePercent: "", isActive: false };

async function fetchTaxConfigs(): Promise<AdminTaxConfigListResponse> {
  const res = await apiClient.get<AdminTaxConfigListResponse>("/admin/finance/tax-configs");
  return res.data;
}

/**
 * 10.08 Taxes & Compliance (docs/admin/03-screen-inventory.md §10.08),
 * added 26 Aug 2026 — reframed during planning
 * (reports/finance-architecture-plan.html §05): this doesn't need
 * engineering, or anyone, to decide real tax law. It's a real settings
 * screen — whoever manages Finance enters their own jurisdiction and
 * rate here. `isActive` defaults off so an unconfigured jurisdiction
 * renders as an honest "not configured" state rather than a silently
 * applied 0% rate.
 */
export function TaxesScreen() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-finance-tax-configs"],
    queryFn: fetchTaxConfigs,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { jurisdiction: string; ratePercent?: number; isActive?: boolean }) =>
      apiClient.post("/admin/finance/tax-configs", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-finance-tax-configs"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
  });

  function startEdit(t: AdminTaxConfigListResponse["taxConfigs"][number]) {
    setForm({ jurisdiction: t.jurisdiction, ratePercent: t.ratePercent === null ? "" : String(t.ratePercent), isActive: t.isActive });
    setShowForm(true);
  }

  return (
    <AppShell title="Taxes & Compliance" subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          This build doesn't encode any tax law — enter your own jurisdiction and rate below. A filing calendar and
          withholding-tax ledger aren't built yet; they'd follow the same manual-entry pattern once there's a real
          filing obligation to track.
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowForm((prev) => !prev);
            }}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showForm ? "Cancel" : "+ Add Jurisdiction"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate({
                jurisdiction: form.jurisdiction,
                ratePercent: form.ratePercent ? Number(form.ratePercent) : undefined,
                isActive: form.isActive,
              });
            }}
            className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4"
          >
            <div className="text-sm font-medium">Tax Configuration</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Jurisdiction
                <input
                  required
                  placeholder="e.g. IN-GST"
                  value={form.jurisdiction}
                  onChange={(e) => setForm((prev) => ({ ...prev, jurisdiction: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Rate (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.ratePercent}
                  onChange={(e) => setForm((prev) => ({ ...prev, ratePercent: e.target.value }))}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-text-dim">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-border-subtle"
              />
              Active
            </label>
            {saveMutation.isError && (
              <p className="text-xs text-danger">{extractErrorMessage(saveMutation.error, "Couldn't save this configuration.")}</p>
            )}
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
          </form>
        )}

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load tax configurations.")}
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
                  <th className="px-4 py-3 font-normal">Jurisdiction</th>
                  <th className="px-4 py-3 font-normal">Rate</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Updated by</th>
                  <th className="px-4 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.taxConfigs.map((t) => (
                  <tr key={t.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{t.jurisdiction}</td>
                    <td className="px-4 py-3 text-text-secondary">{t.ratePercent === null ? "—" : `${t.ratePercent}%`}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.isActive ? "active" : "inactive"} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{t.updatedByAdminName}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {data.taxConfigs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-dim">
                      No jurisdictions configured yet.
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
