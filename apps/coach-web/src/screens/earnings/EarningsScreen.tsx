import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Award, CalendarRange, Info, Landmark, Wallet } from "lucide-react";
import type { CoachMyLevelResponse } from "@fitness-ai-app/types";
import { fetchEarnings, fetchMyLevel } from "@/api/professionalDashboard";
import { fetchPayoutAccount } from "@/api/payoutAccount";
import { EmptyState, ErrorState, ListCard, Page, PageHeader, Section, StatCard } from "@/components/page";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { dateLabel, money } from "@/lib/format";
import { PAYOUT_ACCOUNT_QUERY_KEY, PayoutDetailsCard } from "./PayoutDetailsCard";

const STATUS_COPY_KEYS = ["eligible", "approved", "pending", "paid", "payout_failed"] as const;

/**
 * Earnings, ported from apps/coach-mobile's EarningsScreen (P6). Same two
 * rules: a failed payout leads the page rather than sitting in a row, and
 * the current-month figure says where it comes from instead of showing a
 * confident zero. Laptop: settlements beside the level and fees.
 */
export function EarningsScreen() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["professionalEarnings"], queryFn: fetchEarnings });
  // Package 4: the level and fees Fynrox set for this coach (read-only).
  const { data: myLevel } = useQuery({ queryKey: ["professionalMyLevel"], queryFn: fetchMyLevel });
  // Coach payout details (27 Oct 2026): bank account or UPI ID, masked, verified by Fynrox.
  const { data: payout } = useQuery({ queryKey: PAYOUT_ACCOUNT_QUERY_KEY, queryFn: fetchPayoutAccount });
  const back = isMobile ? { to: "/more", label: t("web.nav.more") } : undefined;

  if (isLoading) {
    return (
      <Page width="wide">
        <PageHeader title={t("earnings.title")} back={back} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Skeleton className="h-[92px] rounded-xl" />
          <Skeleton className="h-[92px] rounded-xl" />
          <Skeleton className="col-span-2 h-[92px] rounded-xl lg:col-span-1" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    );
  }
  if (isError || !data) {
    return (
      <Page width="wide">
        <PageHeader title={t("earnings.title")} back={back} />
        <ErrorState onRetry={() => refetch()} />
      </Page>
    );
  }

  const statusCopy = (status: string) =>
    (STATUS_COPY_KEYS as readonly string[]).includes(status) ? t(`web.business.earnings.statusCopy.${status}`) : status;

  return (
    <Page width="wide">
      <PageHeader
        title={t("earnings.title")}
        description={t("web.business.earnings.commissionNote", { pct: data.commissionPct })}
        back={back}
      />

      {data.payoutFailure ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-destructive">{t("earnings.payoutFailed")}</p>
            <p>
              {t("web.business.earnings.payoutFailedBody", {
                count: data.payoutFailure.count,
                amount: money(data.payoutFailure.amountCents),
              })}
            </p>
            {data.payoutFailure.reason ? <p className="text-muted-foreground">{data.payoutFailure.reason}</p> : null}
            {/* With payout details in the app, point there instead of "send them to support". */}
            <p className="text-muted-foreground">
              {payout?.editable
                ? payout.account
                  ? t("web.business.payout.failedCheckDetails")
                  : t("web.business.payout.failedAddDetails")
                : t("earnings.bankDetailsNote")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label={t("earnings.paidToYou")} value={money(data.lifetimePaidCents)} icon={Landmark} />
          <StatCard label={t("earnings.awaitingPayout")} value={money(data.awaitingPayoutCents)} icon={Wallet} />
          <div className="col-span-2 lg:col-span-1">
            <StatCard
              label={t("earnings.thisMonth")}
              value={money(data.currentMonth.netCents)}
              hint={t("web.business.earnings.monthBreakdown", {
                gross: money(data.currentMonth.grossCents),
                commission: money(data.currentMonth.commissionCents),
              })}
              icon={CalendarRange}
              tone="primary"
            />
          </div>
        </div>
        {/* Said out loud rather than shown as a confident zero. */}
        {data.currentMonth.derivedFromBookings && !data.currentMonth.hasBookingData ? (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" />
            {t("web.business.earnings.derivedNote")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title={t("web.business.earnings.settlements")}>
          {data.settlements.length === 0 ? (
            <EmptyState icon={Wallet} title={t("earnings.emptyTitle")} description={t("earnings.emptySubtitle")} />
          ) : (
            <ListCard>
              {data.settlements.map((s) => (
                <div key={s.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">{dateLabel(s.periodStart, { month: "long", year: "numeric" })}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("web.business.earnings.settlementGross", { gross: money(s.grossCents), pct: s.commissionPct })}
                    </p>
                    <p className="text-sm text-muted-foreground">{statusCopy(s.status)}</p>
                    {s.payoutFailureReason && s.status === "payout_failed" ? (
                      <p className="text-sm text-destructive">{s.payoutFailureReason}</p>
                    ) : null}
                    {s.paidAt ? (
                      <p className="text-xs text-muted-foreground">
                        {t("web.business.earnings.paidOn", { date: dateLabel(s.paidAt, { day: "numeric", month: "short", year: "numeric" }) })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-heading text-base font-semibold tabular-nums">{money(s.netCents)}</span>
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))}
            </ListCard>
          )}
        </Section>

        <div className="flex flex-col gap-6 self-start">
          {payout ? <PayoutDetailsCard data={payout} /> : null}
          {myLevel ? <LevelCard level={myLevel} /> : null}
        </div>
      </div>
    </Page>
  );
}

function LevelCard({ level }: { level: CoachMyLevelResponse }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <Award className="size-4 text-primary-ink" />
          {level.level ? t("web.business.earnings.levelTitle", { name: level.level.name }) : t("web.business.earnings.levelNotSet")}
        </CardTitle>
        <CardDescription>
          {level.level
            ? t("web.business.earnings.levelSetBody", { gst: level.gstPercent })
            : t("web.business.earnings.levelUnsetBody")}
        </CardDescription>
      </CardHeader>
      {level.fees.length > 0 ? (
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {level.fees.map((f) => (
              <li key={f.label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0 text-sm">
                  {t("web.business.earnings.feeLine", { label: f.label, minutes: f.durationMinutes })}
                  {f.upcoming ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("web.business.earnings.feeUpcoming", {
                        price: money(f.upcoming.priceCents),
                        date: new Date(f.upcoming.effectiveFrom).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
                      })}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {f.priceCents === null ? (
                    <span className="font-normal text-muted-foreground">{t("web.business.earnings.feeNotSet")}</span>
                  ) : (
                    money(f.priceCents)
                  )}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
