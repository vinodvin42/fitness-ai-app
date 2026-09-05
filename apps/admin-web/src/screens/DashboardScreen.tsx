import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdminDashboardStats } from "@fitness-ai-app/types";
import { AppShell } from "../components/AppShell";
import { StatCard } from "../components/StatCard";
import { NotAvailablePanel } from "../components/NotAvailablePanel";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

async function fetchDashboardStats(): Promise<AdminDashboardStats> {
  const res = await apiClient.get<AdminDashboardStats>("/admin/dashboard/stats");
  return res.data;
}

/**
 * Executive Dashboard (docs/admin/03-screen-inventory.md 01.01) — the
 * console's first real screen. Every number rendered here comes from
 * GET /admin/dashboard/stats (apps/api's adminDashboard.service.ts), a
 * real aggregate query — see that file's own doc comment for exactly
 * which spec'd KPIs are cut from this slice and why (rendered below via
 * NotAvailablePanel, not silently dropped).
 */
export function DashboardScreen() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: fetchDashboardStats,
  });

  return (
    <AppShell title="Executive Dashboard">
      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load dashboard stats.")}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Users" value={data.kpis.totalUsers} />
            <StatCard label="Active Users (30d)" value={data.kpis.activeUsers30d} hint="Trained, logged a meal, or logged a measurement" />
            <StatCard label="Paid Users" value={data.kpis.activePaidUsers} />
            <StatCard label="New Users (30d)" value={data.kpis.newUsersLast30d} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 lg:col-span-2">
              <div className="text-xs uppercase tracking-wide text-text-dim">User Growth — last 6 months</div>
              <div className="mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.userGrowth}>
                    <XAxis dataKey="month" stroke="#5b6472" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#5b6472" fontSize={11} tickLine={false} axisLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ background: "#161b22", border: "1px solid #232a33", borderRadius: 8 }}
                      labelStyle={{ color: "#f5f7fa" }}
                    />
                    <Line type="monotone" dataKey="count" stroke="#12e5a6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Paid Conversion Funnel</div>
              <div className="mt-3 space-y-2 text-sm">
                <FunnelRow label="Free / Registered" value={data.conversionFunnel.freeRegistered} />
                <FunnelRow label="Trial Users" value={data.conversionFunnel.trialUsers} />
                <FunnelRow label="Converted Paid" value={data.conversionFunnel.convertedPaid} highlight />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Subscriptions by Tier</div>
              <div className="mt-3 space-y-2 text-sm">
                {data.subscriptionsByTier.length === 0 && (
                  <p className="text-text-dim">No active subscriptions yet.</p>
                )}
                {data.subscriptionsByTier.map((row) => (
                  <div key={row.tier} className="flex items-center justify-between">
                    <span className="capitalize text-text-secondary">{row.tier}</span>
                    <span className="font-medium">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Revenue</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Total paid (all-time)</span>
                  <span className="font-medium">₹{(data.revenue.totalPaidCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Failed payments</span>
                  <span className="font-medium text-danger">{data.revenue.failedPayments}</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-text-dim">
                Currency reflects whatever this build's Payment rows were recorded in — see the Razorpay
                currency-mismatch note in docs/mobile/07-open-questions-gaps.md §38.
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">Requires Attention</div>
              <div className="mt-3 space-y-2 text-sm">
                <AttentionRow label="Open support tickets" count={data.requiresAttention.openSupportTickets} />
                <AttentionRow
                  label="In-progress support tickets"
                  count={data.requiresAttention.inProgressSupportTickets}
                />
                <AttentionRow label="Failed payments" count={data.requiresAttention.failedPayments} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Active Professionals" value={data.marketplaceStatus.activeProfessionals} />
            <StatCard
              label="Pending Professional Applications"
              value={data.marketplaceStatus.pendingProfessionalApplications}
            />
            <StatCard
              label="Active Coaching Relationships"
              value={data.marketplaceStatus.activeCoachingRelationships}
            />
            <StatCard
              label="Unassigned Users Pool"
              value={data.marketplaceStatus.unassignedUsersPool}
              hint="Users with no active coaching relationship"
            />
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-dim">Recent Signups</div>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-text-dim">
                  <th className="pb-2 font-normal">Name</th>
                  <th className="pb-2 font-normal">Email</th>
                  <th className="pb-2 font-normal">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSignups.map((u) => (
                  <tr key={u.id} className="border-t border-border-subtle">
                    <td className="py-2">{u.fullName}</td>
                    <td className="py-2 text-text-secondary">{u.email}</td>
                    <td className="py-2 text-text-secondary">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {data.recentSignups.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-text-dim">
                      No signups yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <NotAvailablePanel keys={data.notAvailable} />
        </div>
      )}
    </AppShell>
  );
}

function FunnelRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={highlight ? "font-semibold text-accent" : "font-medium"}>{value}</span>
    </div>
  );
}

function AttentionRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={count > 0 ? "rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning" : "text-text-dim"}>
        {count}
      </span>
    </div>
  );
}
