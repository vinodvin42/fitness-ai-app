import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { StatCard } from "../components/StatCard";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface CommissionEntry {
  id: string;
  status: string;
  commissionCents: number;
  commissionPct: number;
  grossCents: number;
  campaignName: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  disputedReason: string | null;
  payoutFailureReason: string | null;
  payoutFailedAt: string | null;
}

interface Ledger {
  totals: { paidCents: number; pendingCents: number; disputedCents: number };
  hasPayoutFailure: boolean;
  entries: CommissionEntry[];
}

const money = (cents: number) => `₹${(cents / 100).toFixed(2)}`;

/**
 * Commission ledger — the handoff lists pending / paid / disputed as
 * complete, and C-M2 as the missing "payout failed state + reason".
 *
 * DESIGN-PENDING.
 *
 * Two deliberate choices about honesty. A disputed commission shows the
 * reason, because a reversal with no explanation reads as an accusation.
 * And a failed payout is surfaced at the top rather than left for the
 * creator to find in a row, because the fix is usually their own payout
 * details and every day it goes unnoticed is a day they are not paid.
 *
 * The ledger deliberately shows no information about who converted:
 * BR-CRT-002 limits creators to commercial aggregates, and a per-person
 * conversion feed would be a member list by another name.
 */
export function CommissionScreen() {
  const ledger = useQuery({
    queryKey: ["creatorCommissions"],
    queryFn: async () => (await apiClient.get<Ledger>("/influencer-portal/commissions")).data,
  });

  if (ledger.isLoading) {
    return (
      <AppShell title="Commission">
        <p className="text-sm text-text-dim">Loading…</p>
      </AppShell>
    );
  }
  if (ledger.isError || !ledger.data) {
    return (
      <AppShell title="Commission">
        <p className="text-sm text-danger">{extractErrorMessage(ledger.error, "Couldn't load your ledger.")}</p>
      </AppShell>
    );
  }

  const { totals, entries, hasPayoutFailure } = ledger.data;

  return (
    <AppShell title="Commission">
      {hasPayoutFailure ? (
        <div className="mb-5 rounded-md bg-danger/10 px-4 py-3">
          <p className="text-sm font-medium text-danger">A payout to you didn't go through</p>
          <p className="mt-1 text-sm text-text-secondary">
            The commission is still owed to you and will be included in the next payout run. If your bank or UPI
            details have changed, send them to your FynroX contact so the retry succeeds.
          </p>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Paid" value={money(totals.paidCents)} />
        <StatCard label="Pending" value={money(totals.pendingCents)} />
        <StatCard label="Under review" value={money(totals.disputedCents)} />
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-text-dim">
          No commission yet. Once someone subscribes through one of your links, it'll appear here.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-text-dim">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Campaign</th>
              <th className="py-2 pr-4">Rate</th>
              <th className="py-2 pr-4">Commission</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border-subtle/60 align-top">
                <td className="py-3 pr-4 text-text-secondary">{new Date(e.createdAt).toLocaleDateString()}</td>
                <td className="py-3 pr-4 text-text-primary">{e.campaignName ?? "—"}</td>
                <td className="py-3 pr-4 text-text-secondary">{e.commissionPct}%</td>
                <td className="py-3 pr-4 text-text-primary">{money(e.commissionCents)}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={e.status} />
                  {e.disputedReason ? (
                    <p className="mt-1 max-w-xs text-[11px] text-text-dim">{e.disputedReason}</p>
                  ) : null}
                  {e.payoutFailureReason ? (
                    <p className="mt-1 max-w-xs text-[11px] text-danger">
                      Payout failed{e.payoutFailedAt ? ` on ${new Date(e.payoutFailedAt).toLocaleDateString()}` : ""} —{" "}
                      {e.payoutFailureReason}
                    </p>
                  ) : null}
                  {e.paidAt ? (
                    <p className="mt-1 text-[11px] text-text-dim">Paid {new Date(e.paidAt).toLocaleDateString()}</p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
