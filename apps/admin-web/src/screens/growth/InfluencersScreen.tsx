import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminInfluencerDetail, AdminInfluencerListResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { GROWTH_SUB_NAV } from "./subNav";

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function fetchInfluencers(): Promise<AdminInfluencerListResponse> {
  const res = await apiClient.get<AdminInfluencerListResponse>("/admin/influencers");
  return res.data;
}

async function fetchInfluencer(id: string): Promise<AdminInfluencerDetail> {
  const res = await apiClient.get<AdminInfluencerDetail>(`/admin/influencers/${id}`);
  return res.data;
}

/**
 * 07.01/07.02 Influencers + 10.07 Payouts (docs/admin/03-screen-inventory.md),
 * added 31 Aug 2026 — a real influencer directory plus admin-recorded
 * payouts. No campaign/attribution tracking exists, so commission % is
 * recorded metadata and payouts are admin-entered amounts, not computed from
 * attributed revenue — see adminInfluencers.service.ts. Marking a payout
 * paid records a Finance Expense (category influencer_payout).
 */
export function InfluencersScreen() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [commissionPct, setCommissionPct] = useState("20");

  const list = useQuery({ queryKey: ["admin-influencers"], queryFn: fetchInfluencers });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post("/admin/influencers", {
        name,
        handle: handle || undefined,
        commissionPct: Number(commissionPct || "20"),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-influencers"] });
      setShowForm(false);
      setName("");
      setHandle("");
      setCommissionPct("20");
    },
  });

  return (
    <AppShell title="Influencers" subNav={GROWTH_SUB_NAV}>
      <div className="space-y-4">
        {list.data && (
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Total" value={list.data.counts.total} />
            <StatCard label="Active" value={list.data.counts.active} />
            <StatCard label="Paid out" value={money(list.data.counts.totalPaidCents)} />
            <StatCard label="Pending" value={money(list.data.counts.totalPendingCents)} />
          </div>
        )}

        <div className="flex items-center justify-end rounded-lg border border-border-subtle bg-surface p-4">
          <button
            type="button"
            onClick={() => setShowForm((p) => !p)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas"
          >
            {showForm ? "Cancel" : "+ New Influencer"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="grid grid-cols-1 gap-3 rounded-lg border border-border-subtle bg-surface p-4 sm:grid-cols-4"
          >
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Handle
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Commission %
              <input
                type="number"
                min={0}
                max={100}
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              />
            </label>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="self-end rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
            >
              {createMutation.isPending ? "Saving…" : "Add"}
            </button>
          </form>
        )}

        {list.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {list.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(list.error, "Couldn't load influencers.")}
            <button type="button" onClick={() => list.refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {list.data && (
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-normal">Name</th>
                  <th className="px-4 py-3 font-normal">Commission</th>
                  <th className="px-4 py-3 font-normal">Paid</th>
                  <th className="px-4 py-3 font-normal">Pending</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {list.data.influencers.map((i) => (
                  <tr key={i.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{i.name}</div>
                      {i.handle && <div className="text-xs text-text-dim">{i.handle}</div>}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{i.commissionPct}%</td>
                    <td className="px-4 py-3 text-text-secondary">{money(i.paidCents)}</td>
                    <td className="px-4 py-3 text-text-secondary">{money(i.pendingCents)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={i.status === "active" ? "active" : "inactive"} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedId(selectedId === i.id ? null : i.id)}
                        className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                      >
                        {selectedId === i.id ? "Hide" : "Payouts"}
                      </button>
                    </td>
                  </tr>
                ))}
                {list.data.influencers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-dim">
                      No influencers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedId && <PayoutsPanel influencerId={selectedId} />}
      </div>
    </AppShell>
  );
}

function PayoutsPanel({ influencerId }: { influencerId: string }) {
  const queryClient = useQueryClient();
  const [amountDisplay, setAmountDisplay] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");

  const detail = useQuery({
    queryKey: ["admin-influencer", influencerId],
    queryFn: () => fetchInfluencer(influencerId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-influencer", influencerId] });
    queryClient.invalidateQueries({ queryKey: ["admin-influencers"] });
  };

  const createPayout = useMutation({
    mutationFn: () =>
      apiClient.post(`/admin/influencers/${influencerId}/payouts`, {
        amountCents: Math.round(Number(amountDisplay || "0") * 100),
        periodLabel,
      }),
    onSuccess: () => {
      invalidate();
      setAmountDisplay("");
      setPeriodLabel("");
    },
  });

  const markPaid = useMutation({
    mutationFn: (payoutId: string) => apiClient.post(`/admin/payouts/${payoutId}/mark-paid`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-surface p-4">
      <div className="text-sm font-medium text-text-primary">
        Payouts{detail.data ? ` — ${detail.data.name}` : ""}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createPayout.mutate();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Amount
          <input
            required
            type="number"
            min={0.01}
            step="0.01"
            value={amountDisplay}
            onChange={(e) => setAmountDisplay(e.target.value)}
            className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Period
          <input
            required
            placeholder="Aug 2026"
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={createPayout.isPending}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
        >
          {createPayout.isPending ? "Saving…" : "Record Payout"}
        </button>
      </form>

      {detail.isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
      {detail.data && detail.data.payouts.length === 0 && (
        <p className="text-sm text-text-dim">No payouts recorded yet.</p>
      )}
      {detail.data && detail.data.payouts.length > 0 && (
        <table className="w-full text-left text-sm">
          <tbody>
            {detail.data.payouts.map((p) => (
              <tr key={p.id} className="border-b border-border-subtle last:border-0">
                <td className="py-2 text-text-secondary">{p.periodLabel}</td>
                <td className="py-2 text-text-primary">{money(p.amountCents)}</td>
                <td className="py-2">
                  <StatusBadge status={p.status} />
                </td>
                <td className="py-2 text-right">
                  {p.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => markPaid.mutate(p.id)}
                      disabled={markPaid.isPending}
                      className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                    >
                      Mark Paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
