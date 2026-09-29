import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { BusinessAnalyticsResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ANALYTICS_SUB_NAV } from "./subNav";

function money(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SOURCE_LABELS: Record<string, string> = {
  subscriptions: "Subscriptions",
  programs: "Programs",
  coaching_gmv: "Coaching (booking value)",
};

async function fetchBusiness(): Promise<BusinessAnalyticsResponse> {
  const res = await apiClient.get<BusinessAnalyticsResponse>("/admin/analytics/business");
  return res.data;
}

/**
 * 09.04 Business Analytics (docs/admin/03-screen-inventory.md), added 31 Aug
 * 2026 — unblocked once per-coach commission + Coach Settlements shipped
 * (the take-rate decision it was waiting on). Real marketplace economics:
 * GMV (delivered booking value), platform commission take, coach net, and
 * revenue by source. All-time totals. See adminAnalytics.service.ts's
 * getBusinessAnalytics.
 */
export function BusinessAnalyticsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-business-analytics"],
    queryFn: fetchBusiness,
  });

  return (
    <AppShell title={t("businessAnalytics.businessAnalytics")} subNav={ANALYTICS_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">{t("businessAnalytics.loading")}</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load business analytics.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("businessAnalytics.retry")}
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="text-xs uppercase tracking-wide text-text-dim">{t("businessAnalytics.coachingMarketplaceAllTime")}</div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label={t("businessAnalytics.gmvBookingValue")} value={money(data.marketplace.gmvCents)} />
              <StatCard label={t("businessAnalytics.platformCommission")} value={money(data.marketplace.platformCommissionCents)} />
              <StatCard label={t("businessAnalytics.coachNetEarnings")} value={money(data.marketplace.coachEarningsCents)} />
              <StatCard
                label={t("businessAnalytics.takeRate")}
                value={data.marketplace.takeRatePct != null ? `${data.marketplace.takeRatePct}%` : "—"}
              />
              <StatCard label={t("businessAnalytics.bookings")} value={data.marketplace.bookingCount} />
              <StatCard label={t("businessAnalytics.activeCoaches")} value={data.marketplace.activeCoaches} />
              <StatCard label={t("businessAnalytics.avgBooking")} value={money(data.marketplace.avgBookingValueCents)} />
              <StatCard label={t("businessAnalytics.settledPaid")} value={money(data.marketplace.settlementsPaidCents)} />
            </div>

            <p className="text-xs text-text-dim">
              GMV is delivered booking value, not funds collected — coaching bookings don't run through the payment
              gateway yet (see adminAnalytics.service.ts).
            </p>

            <div className="text-xs uppercase tracking-wide text-text-dim">{t("businessAnalytics.revenueBySource")}</div>
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">{t("businessAnalytics.source")}</th>
                    <th className="px-4 py-3 font-normal">{t("businessAnalytics.count")}</th>
                    <th className="px-4 py-3 font-normal">{t("businessAnalytics.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenueBySource.map((r) => (
                    <tr key={r.source} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-text-primary">{SOURCE_LABELS[r.source] ?? r.source}</td>
                      <td className="px-4 py-3 text-text-secondary">{r.count}</td>
                      <td className="px-4 py-3 text-text-secondary">{money(r.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <NotAvailablePanel
              keys={data.notAvailable}
              subtitle={t("businessAnalytics.noChannelAttributionDimension")}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
