import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { AdminAcquisitionReportResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { GROWTH_SUB_NAV } from "../growth/subNav";

const CHANNEL_LABELS: Record<string, string> = {
  organic: "Organic",
  paid_search: "Paid Search",
  paid_social: "Paid Social",
  referral: "Referral",
  influencer: "Influencer",
  gym_partner: "Gym Partner",
  direct: "Direct",
};

async function fetchReport(startDate: string, endDate: string): Promise<AdminAcquisitionReportResponse> {
  const res = await apiClient.get<AdminAcquisitionReportResponse>("/admin/acquisition/report", {
    params: startDate && endDate ? { startDate, endDate } : undefined,
  });
  return res.data;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

/**
 * 07.04 Campaigns & Attribution — Acquisition Report half (docs/admin/
 * 03-screen-inventory.md §07.04, Developer 3's work package §11 "Required
 * Analytics/Founder Dashboard"), added 20 Sep 2026 (R2 Wave 4). Compares
 * every real §11 channel (Organic, Paid Search, Paid Social, Referral,
 * Influencer ["Creator"], Gym Partner ["Gym"], Direct — "Meta"/"Google"/
 * "YouTube" are real Campaigns *under* paid_social/paid_search, not their
 * own channel rows, per the fixed v1 taxonomy's own doc comment in
 * schema.prisma) by real registrations, activated users, users who logged
 * a first workout, and paid conversions.
 *
 * All-time by default (no date range picked) — see
 * adminAcquisition.service.ts's own comment for why that's the honest
 * default on data this young; picking both dates scopes the report to a
 * window, same UX as 09.01 User Analytics' own date pickers.
 *
 * W1/W4 retention by channel is a real, named gap (see the `NotAvailable`
 * panel below and the service's own doc comment) — not built this wave,
 * not faked here.
 */
export function AcquisitionReportScreen() {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-acquisition-report", startDate, endDate],
    queryFn: () => fetchReport(startDate, endDate),
  });

  return (
    <AppShell title={t("acquisitionReport.acquisitionReport")} subNav={GROWTH_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("acquisitionReport.from")}
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            To
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
            >
              {t("acquisitionReport.clearAllTime")}
            </button>
          )}
          <span className="text-xs text-text-dim">
            {data?.period ? `Showing ${data.period.start.slice(0, 10)} — ${data.period.end.slice(0, 10)}` : "Showing all-time"}
          </span>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">{t("acquisitionReport.loading")}</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load the acquisition report.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("acquisitionReport.retry")}
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label={t("acquisitionReport.registrations")} value={data.totals.registrations} />
              <StatCard label={t("acquisitionReport.activated")} value={`${data.totals.activatedUsers} (${pct(data.totals.activatedUsers, data.totals.registeredUsers)})`} />
              <StatCard
                label={t("acquisitionReport.logged1stWorkout")}
                value={`${data.totals.usersWithFirstWorkout} (${pct(data.totals.usersWithFirstWorkout, data.totals.registeredUsers)})`}
              />
              <StatCard
                label={t("acquisitionReport.paidConversions")}
                value={`${data.totals.paidConversions} (${pct(data.totals.paidConversions, data.totals.registeredUsers)})`}
              />
            </div>

            <div className="text-xs uppercase tracking-wide text-text-dim">{t("acquisitionReport.byChannel")}</div>
            <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.channel")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.registrations")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.activated")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.n1stWorkout")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.paid")}</th>
                    <th className="px-4 py-3 font-normal" title="A workout within 7 days of signup">W1</th>
                    <th className="px-4 py-3 font-normal" title="A workout 21-28 days after signup">W4</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byChannel.map((row) => (
                    <tr key={row.channel} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 font-medium text-text-primary">{CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.registrations}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.activatedUsers} <span className="text-text-dim">({pct(row.activatedUsers, row.registeredUsers)})</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.usersWithFirstWorkout}{" "}
                        <span className="text-text-dim">({pct(row.usersWithFirstWorkout, row.registeredUsers)})</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {row.paidConversions} <span className="text-text-dim">({pct(row.paidConversions, row.registeredUsers)})</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary" title={`${row.w1Retention.retained} of ${row.w1Retention.eligible} members whose window has passed`}>
                        {row.w1Retention.pct === null ? "—" : `${row.w1Retention.pct}%`}
                      </td>
                      <td className="px-4 py-3 text-text-secondary" title={`${row.w4Retention.retained} of ${row.w4Retention.eligible} members whose window has passed`}>
                        {row.w4Retention.pct === null ? "—" : `${row.w4Retention.pct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-xs uppercase tracking-wide text-text-dim">{t("acquisitionReport.byCampaign")}</div>
            <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.campaign")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.channel")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.status")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.registrations")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.activated")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.n1stWorkout")}</th>
                    <th className="px-4 py-3 font-normal">{t("acquisitionReport.paid")}</th>
                    <th className="px-4 py-3 font-normal" title="A workout within 7 days of signup">W1</th>
                    <th className="px-4 py-3 font-normal" title="A workout 21-28 days after signup">W4</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCampaign.map((row) => (
                    <tr key={row.campaignId} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{row.campaignName}</div>
                        <div className="text-xs text-text-dim">{row.linkCode}</div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{row.registrations}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.activatedUsers}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.usersWithFirstWorkout}</td>
                      <td className="px-4 py-3 text-text-secondary">{row.paidConversions}</td>
                      <td className="px-4 py-3 text-text-secondary" title={`${row.w1Retention.retained} of ${row.w1Retention.eligible} members whose window has passed`}>
                        {row.w1Retention.pct === null ? "—" : `${row.w1Retention.pct}%`}
                      </td>
                      <td className="px-4 py-3 text-text-secondary" title={`${row.w4Retention.retained} of ${row.w4Retention.eligible} members whose window has passed`}>
                        {row.w4Retention.pct === null ? "—" : `${row.w4Retention.pct}%`}
                      </td>
                    </tr>
                  ))}
                  {data.byCampaign.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-text-dim">
                        {t("acquisitionReport.noCampaignAttributedRegistrations")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-text-dim">
              W1: a workout within 7 days of signup. W4: a workout 21-28 days after signup. Each counts only members whose
              window has passed; — means none yet.
            </p>
            <NotAvailablePanel keys={data.notAvailable} />
          </>
        )}
      </div>
    </AppShell>
  );
}
