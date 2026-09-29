import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { AdminRevenueWaterfallResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

interface Filters {
  startDate: string;
  endDate: string;
}

async function fetchWaterfall(filters: Filters): Promise<AdminRevenueWaterfallResponse> {
  const res = await apiClient.get<AdminRevenueWaterfallResponse>("/admin/finance/revenue-waterfall", {
    params: { startDate: filters.startDate || undefined, endDate: filters.endDate || undefined },
  });
  return res.data;
}

// One row of the waterfall — a bar scaled against Gross (100%), with a
// signed cents value and the running-total label after it applies.
function WaterfallRow({
  label,
  cents,
  runningTotalCents,
  grossCents,
  tone,
  isFinal,
}: {
  label: string;
  cents: number;
  runningTotalCents: number;
  grossCents: number;
  tone: "positive" | "negative" | "neutral";
  isFinal?: boolean;
}) {
  const pctOfGross = grossCents > 0 ? Math.min(100, Math.round((Math.abs(cents) / grossCents) * 100)) : 0;
  const barColor = tone === "negative" ? "bg-danger" : isFinal ? "bg-accent" : "bg-text-dim";
  const sign = tone === "negative" ? "−" : tone === "positive" && cents > 0 ? "" : "";

  return (
    <div className="flex flex-col gap-1 border-b border-border-subtle px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="w-full text-sm text-text-primary sm:w-48 sm:shrink-0">{label}</div>
      <div className="h-2 flex-1 rounded-full bg-surface-raised">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pctOfGross}%` }} />
      </div>
      <div className={`w-full text-right text-sm sm:w-32 sm:shrink-0 ${tone === "negative" ? "text-danger" : "text-text-primary"}`}>
        {sign}
        {money(Math.abs(cents))}
      </div>
      <div className="w-full text-right text-xs text-text-dim sm:w-36 sm:shrink-0">
        {isFinal ? "= Net revenue" : `→ ${money(runningTotalCents)}`}
      </div>
    </div>
  );
}

/**
 * 06.01 / PAY-06 Revenue Waterfall, added 5 Sep 2026 — a real Gross →
 * Discounts → Refunds → Coach Settlements → Net chain, built once every
 * stage had genuine backing data (Coupons, Refunds, and Coach Settlements
 * all shipped 31 Aug 2026; PAY-01's real coaching-payment data landed
 * 5 Sep 2026). See adminFinance.service.ts's `getRevenueWaterfall()` doc
 * comment for exactly how each stage is computed and why Influencer
 * Payouts is the one thing NOT netted in here.
 *
 * Rendered as a scaled bar per stage rather than a floating-bar chart —
 * this codebase has no existing waterfall-chart component to build from
 * (every other Finance/Analytics chart here is a `recharts` LineChart),
 * and a plain scaled-bar-plus-number row is exactly as honest about the
 * six real figures without introducing a new charting dependency for one
 * screen.
 */
export function RevenueWaterfallScreen() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({ startDate: "", endDate: "" });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-finance-waterfall", filters],
    queryFn: () => fetchWaterfall(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return (
    <AppShell title={t("revenueWaterfall.revenueWaterfall")} subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("revenueWaterfall.from")}
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilter("startDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            To
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilter("endDate", e.target.value)}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>
          <span className="pb-1.5 text-[11px] text-text-dim">{t("revenueWaterfall.defaultsToAllTime")}</span>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">{t("revenueWaterfall.loading")}</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load the revenue waterfall.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              {t("revenueWaterfall.retry")}
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label={t("revenueWaterfall.grossRevenue")} value={money(data.stages.grossCents)} hint="Before any discount" />
              <StatCard
                label={t("revenueWaterfall.netOfDiscounts")}
                value={money(data.stages.netOfDiscountsCents)}
                hint="What was actually charged"
              />
              <StatCard
                label={t("revenueWaterfall.netRevenue")}
                value={money(data.stages.netRevenueCents)}
                hint="After refunds & coach settlements"
              />
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface">
              <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
                {t("revenueWaterfall.grossNetStageBy")}
              </div>
              <WaterfallRow
                label={t("revenueWaterfall.grossRevenue")}
                cents={data.stages.grossCents}
                runningTotalCents={data.stages.grossCents}
                grossCents={data.stages.grossCents}
                tone="neutral"
              />
              <WaterfallRow
                label={t("revenueWaterfall.discounts")}
                cents={data.stages.discountCents}
                runningTotalCents={data.stages.netOfDiscountsCents}
                grossCents={data.stages.grossCents}
                tone="negative"
              />
              <WaterfallRow
                label={t("revenueWaterfall.refunds")}
                cents={data.stages.refundCents}
                runningTotalCents={data.stages.netOfDiscountsCents - data.stages.refundCents}
                grossCents={data.stages.grossCents}
                tone="negative"
              />
              <WaterfallRow
                label={t("revenueWaterfall.coachSettlements")}
                cents={data.stages.coachSettlementCents}
                runningTotalCents={data.stages.netRevenueCents}
                grossCents={data.stages.grossCents}
                tone="negative"
              />
              <WaterfallRow
                label={t("revenueWaterfall.netRevenue2")}
                cents={data.stages.netRevenueCents}
                runningTotalCents={data.stages.netRevenueCents}
                grossCents={data.stages.grossCents}
                tone="positive"
                isFinal
              />
            </div>

            <p className="text-xs text-text-dim">
              Coach Settlements above is what's actually been paid out to coaches in this range, not gross booking
              value delivered-but-unsettled — a deliberately conservative number. Discounts and Refunds are real
              redeemed coupons and processed Razorpay refunds, not estimates.
            </p>

            <NotAvailablePanel
              keys={data.notAvailable}
              subtitle={t("revenueWaterfall.influencerPayoutsAreAdmin")}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
