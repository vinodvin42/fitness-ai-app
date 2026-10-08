import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdminActionItemListResponse, AdminDashboardStats } from "@fitness-ai-app/types";
import { AppShell } from "../components/AppShell";
import { StatCard } from "../components/StatCard";
import { NotAvailablePanel } from "../components/NotAvailablePanel";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";
import { DASHBOARD_SUB_NAV } from "./dashboard/subNav";

async function fetchDashboardStats(): Promise<AdminDashboardStats> {
  const res = await apiClient.get<AdminDashboardStats>("/admin/dashboard/stats");
  return res.data;
}

async function fetchOpenActionItems(): Promise<AdminActionItemListResponse> {
  const res = await apiClient.get<AdminActionItemListResponse>("/admin/action-items", {
    params: { status: "open" },
  });
  return res.data;
}

/**
 * Executive Dashboard (docs/admin/03-screen-inventory.md 01.01) — the
 * console's first real screen. Every number rendered here comes from
 * GET /admin/dashboard/stats (apps/api's adminDashboard.service.ts), a
 * real aggregate query — see that file's own doc comment for exactly
 * which spec'd KPIs are cut from this slice and why (rendered below via
 * NotAvailablePanel, not silently dropped).
 *
 * **R2 Wave 4 (20 Sep 2026):** the old "Requires Attention" card here used
 * to be a cosmetic, hardcoded 4-row widget reading straight off
 * `data.requiresAttention` (support tickets/failed payments/refunds only,
 * no drill-through, no severity, no assign/resolve). It's retired — this
 * wave built the real, unified `AdminActionItem` queue (`ActionRequiredScreen`
 * at "/action-required", see that file's own doc comment) as the honest
 * "Dashboard / Action Required" functional area Developer 3's §3 names
 * first. What replaces it here is a small, real open-item-count-by-severity
 * summary (its own GET /admin/action-items?status=open call) that links
 * straight through to the full queue — not a second copy of the queue
 * itself, so there's exactly one place severity/type/assignment filtering
 * actually lives.
 */
export function DashboardScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: fetchDashboardStats,
  });

  const actionItems = useQuery({
    queryKey: ["admin-action-items", "dashboard-summary"],
    queryFn: fetchOpenActionItems,
  });

  return (
    <AppShell title={t("dashboard.executiveDashboard")} subNav={DASHBOARD_SUB_NAV}>
      {isLoading && <p className="text-sm text-text-secondary">{t("dashboard.loading")}</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load dashboard stats.")}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t("dashboard.totalUsers")} value={data.kpis.totalUsers} />
            <StatCard label={t("dashboard.activeUsers30d")} value={data.kpis.activeUsers30d} hint="Trained, logged a meal, or logged a measurement" />
            <StatCard label={t("dashboard.paidUsers")} value={data.kpis.activePaidUsers} />
            <StatCard label={t("dashboard.newUsers30d")} value={data.kpis.newUsersLast30d} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 lg:col-span-2">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.userGrowthLast6")}</div>
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
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.paidConversionFunnel")}</div>
              <div className="mt-3 space-y-2 text-sm">
                <FunnelRow label={t("dashboard.freeRegistered")} value={data.conversionFunnel.freeRegistered} />
                <FunnelRow label={t("dashboard.trialUsers")} value={data.conversionFunnel.trialUsers} />
                <FunnelRow label={t("dashboard.convertedPaid")} value={data.conversionFunnel.convertedPaid} highlight />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.subscriptionsByTier")}</div>
              <div className="mt-3 space-y-2 text-sm">
                {data.subscriptionsByTier.length === 0 && (
                  <p className="text-text-dim">{t("dashboard.noActiveSubscriptionsYet")}</p>
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
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.revenue")}</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">{t("dashboard.totalPaidAllTime")}</span>
                  <span className="font-medium">₹{(data.revenue.totalPaidCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">{t("dashboard.failedPayments")}</span>
                  <span className="font-medium text-danger">{data.revenue.failedPayments}</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-text-dim">
                Currency reflects whatever this build's Payment rows were recorded in — see the Razorpay
                currency-mismatch note in docs/mobile/07-open-questions-gaps.md §38.
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.requiresAttention")}</div>
                <Link to="/action-required" className="text-xs text-accent hover:underline">
                  {t("dashboard.viewQueue")}
                </Link>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {actionItems.isLoading && <p className="text-text-dim">{t("dashboard.loading")}</p>}
                {actionItems.isError && <p className="text-danger">{t("dashboard.couldnTLoadThe")}</p>}
                {actionItems.data && (
                  <>
                    <AttentionRow
                      label={t("dashboard.openActionItems")}
                      count={actionItems.data.items.length}
                    />
                    <AttentionRow
                      label={t("dashboard.highSeverity")}
                      count={actionItems.data.items.filter((i) => i.severity === "high").length}
                    />
                    <AttentionRow
                      label={t("dashboard.mediumSeverity")}
                      count={actionItems.data.items.filter((i) => i.severity === "medium").length}
                    />
                    <AttentionRow
                      label={t("dashboard.lowSeverity")}
                      count={actionItems.data.items.filter((i) => i.severity === "low").length}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t("dashboard.activeProfessionals")} value={data.marketplaceStatus.activeProfessionals} />
            <StatCard
              label={t("dashboard.pendingProfessionalApplications")}
              value={data.marketplaceStatus.pendingProfessionalApplications}
            />
            <StatCard
              label={t("dashboard.activeCoachingRelationships")}
              value={data.marketplaceStatus.activeCoachingRelationships}
            />
            <StatCard
              label={t("dashboard.unassignedUsersPool")}
              value={data.marketplaceStatus.unassignedUsersPool}
              hint="Users with no active coaching relationship"
            />
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.recentSignups")}</div>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-text-dim">
                  <th className="pb-2 font-normal">{t("dashboard.name")}</th>
                  <th className="pb-2 font-normal">{t("dashboard.email")}</th>
                  <th className="pb-2 font-normal">{t("dashboard.joined")}</th>
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
                      {t("dashboard.noSignupsYet")}
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
