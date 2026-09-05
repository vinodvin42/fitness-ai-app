import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminSettlementsResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchSettlements(month: string): Promise<AdminSettlementsResponse> {
  const res = await apiClient.get<AdminSettlementsResponse>("/admin/settlements", { params: { month } });
  return res.data;
}

/**
 * 10.06 Coach Settlements (docs/admin/03-screen-inventory.md), added 31 Aug
 * 2026. Per-coach booking value for a month, net of that coach's
 * configurable commission (editable inline). "Settle" records a real
 * CoachSettlement + a Finance Expense (category coach_settlement). "Gross"
 * is delivered booking value, not funds collected — coaching bookings don't
 * run through Razorpay yet. See adminSettlements.service.ts.
 */
export function SettlementsScreen() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [commissionDraft, setCommissionDraft] = useState<Record<string, string>>({});

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-settlements", month],
    queryFn: () => fetchSettlements(month),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-settlements"] });

  const commissionMutation = useMutation({
    mutationFn: ({ professionalId, commissionPct }: { professionalId: string; commissionPct: number }) =>
      apiClient.patch(`/admin/settlements/commission/${professionalId}`, { commissionPct }),
    onSuccess: invalidate,
  });

  const settleMutation = useMutation({
    mutationFn: (professionalId: string) => apiClient.post("/admin/settlements", { professionalId, month }),
    onSuccess: invalidate,
  });

  return (
    <AppShell title="Coach Settlements" subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Gross (booking value)" value={money(data.summary.grossCents)} />
            <StatCard label="Platform commission" value={money(data.summary.commissionCents)} />
            <StatCard label="Coach net" value={money(data.summary.netCents)} />
            <StatCard label="Unsettled net" value={money(data.summary.unsettledNetCents)} />
          </div>
        )}

        <div className="flex items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonth())}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <p className="text-xs text-text-secondary">
            Gross is delivered booking value in the selected month — not funds collected (coaching bookings don't run
            through the gateway yet).
          </p>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load settlements.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}
        {settleMutation.isError && (
          <p className="text-xs text-danger">{extractErrorMessage(settleMutation.error, "Couldn't settle this coach.")}</p>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Coach</th>
                  <th className="px-4 py-3 font-normal">Bookings</th>
                  <th className="px-4 py-3 font-normal">Gross</th>
                  <th className="px-4 py-3 font-normal">Commission %</th>
                  <th className="px-4 py-3 font-normal">Net payable</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const draft = commissionDraft[r.professionalId] ?? String(r.commissionPct);
                  const settled = r.settlement?.status === "paid";
                  return (
                    <tr key={r.professionalId} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 font-medium text-text-primary">{r.professionalName}</td>
                      <td className="px-4 py-3 text-text-secondary">{r.bookingCount}</td>
                      <td className="px-4 py-3 text-text-secondary">{money(r.grossCents)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={draft}
                            disabled={settled}
                            onChange={(e) =>
                              setCommissionDraft((prev) => ({ ...prev, [r.professionalId]: e.target.value }))
                            }
                            className="w-16 rounded-md border border-border-subtle bg-surface-raised px-2 py-1 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-50"
                          />
                          {!settled && Number(draft) !== r.commissionPct && (
                            <button
                              type="button"
                              onClick={() =>
                                commissionMutation.mutate({
                                  professionalId: r.professionalId,
                                  commissionPct: Number(draft),
                                })
                              }
                              className="rounded-md border border-border-subtle px-2 py-1 text-xs text-accent hover:border-accent"
                            >
                              Save
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-primary">{money(r.netCents)}</td>
                      <td className="px-4 py-3">
                        {r.settlement ? <StatusBadge status={r.settlement.status} /> : <span className="text-text-dim">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {settled ? (
                          <span className="text-xs text-text-dim">Settled</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => settleMutation.mutate(r.professionalId)}
                            disabled={settleMutation.isPending || r.netCents <= 0}
                            className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                          >
                            Settle
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-text-dim">
                      No delivered coaching bookings in this month.
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
            subtitle="Influencer payouts live under Growth → Influencers — see adminSettlements.service.ts."
          />
        )}
      </div>
    </AppShell>
  );
}
