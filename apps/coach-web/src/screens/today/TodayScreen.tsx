import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clapperboard,
  IndianRupee,
  MessageSquare,
  Star,
  UserPlus,
  Users,
} from "lucide-react";
import type { StuckRelationshipItem } from "@fitness-ai-app/types";
import { fetchDashboardStats, fetchEarnings } from "@/api/professionalDashboard";
import { fetchMyRatings } from "@/api/sessionRatings";
import { EmptyState, ErrorState, ListCard, ListSkeleton, Page, PageHeader, RowLink, Section, StatCard } from "@/components/page";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useFormReviewsToDo, useShellCounts } from "@/lib/coachAlerts";
import { dateLabel, money, periodLabel, SERVICE_LABELS, SERVICE_SHORT, timeAgo, timeLabel } from "@/lib/format";

function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? "web.today.greetingMorning" : h < 17 ? "web.today.greetingAfternoon" : "web.today.greetingEvening";
}

/**
 * Today: what needs the coach, the day's sessions, and how the business is
 * doing. Same data as the old app's Today (dashboard stats, earnings,
 * ratings), laid out as two columns on a laptop and one on a phone.
 */
export function TodayScreen() {
  const { t } = useTranslation();
  const { professional } = useAuth();
  const stats = useQuery({ queryKey: ["professional-dashboard-stats"], queryFn: fetchDashboardStats });
  const earnings = useQuery({ queryKey: ["professional-earnings"], queryFn: fetchEarnings });
  const ratings = useQuery({ queryKey: ["coach-my-ratings"], queryFn: () => fetchMyRatings() });
  const firstName = professional?.fullName.split(" ")[0] ?? "";
  const d = stats.data;
  const rating = ratings.data && ratings.data.count > 0 && ratings.data.average != null ? ratings.data : null;

  return (
    <Page width="wide">
      <PageHeader
        title={t(greetingKey(), { name: firstName })}
        description={dateLabel(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <Button variant="outline" className="hidden sm:inline-flex" render={<Link to="/calendar" />}>
            <CalendarDays />
            {t("web.today.viewCalendar")}
          </Button>
        }
      />

      <NeedsYou />

      {stats.isError ? <ErrorState onRetry={() => stats.refetch()} /> : null}
      {d && d.stuckRelationships.length > 0 ? <StuckBanner items={d.stuckRelationships} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d ? (
          <>
            <StatCard label={t("today.activeClients")} value={d.activeClients} icon={Users} />
            <StatCard label={t("today.sessionsThisWeek")} value={d.sessionsThisWeek} icon={CalendarDays} />
          </>
        ) : (
          <>
            <Skeleton className="h-[92px] rounded-xl" />
            <Skeleton className="h-[92px] rounded-xl" />
          </>
        )}
        {earnings.data ? (
          <StatCard
            label={t("today.thisMonthNet")}
            value={money(earnings.data.currentMonth.netCents)}
            hint={t("today.grossLine", { gross: money(earnings.data.currentMonth.grossCents), pct: earnings.data.commissionPct })}
            icon={IndianRupee}
            tone="primary"
          />
        ) : (
          <Skeleton className="h-[92px] rounded-xl" />
        )}
        <StatCard
          label={t("today.avgRating")}
          value={rating ? `${rating.average!.toFixed(1)}` : "–"}
          hint={rating ? t("today.ratingCount", { count: rating.count }) : ratings.isError ? t("today.ratingError") : t("today.noRatings")}
          icon={Star}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section
          title={t("today.schedule")}
          actions={
            <Link to="/calendar" className="text-sm font-medium text-primary-ink hover:underline">
              {t("web.today.viewCalendar")}
            </Link>
          }
        >
          {stats.isLoading ? <ListSkeleton rows={3} /> : null}
          {d && d.todaysSchedule.length === 0 ? <EmptyState icon={CalendarDays} title={t("today.noSessions")} /> : null}
          {d && d.todaysSchedule.length > 0 ? (
            <ListCard>
              {d.todaysSchedule.map((item) => (
                <RowLink
                  key={item.id}
                  to={`/clients/${item.clientId}`}
                  leading={
                    <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{timeLabel(item.scheduledAt)}</span>
                  }
                  title={item.clientFullName}
                  subtitle={`${item.offeringLabel} · ${item.durationMinutes} min`}
                  trailing={<ChevronRight className="size-4 text-muted-foreground" />}
                />
              ))}
            </ListCard>
          ) : null}
        </Section>

        <div className="space-y-6">
          <Section title={t("today.quickActions")}>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <QuickAction to="/clients/requests" icon={UserPlus} label={t("today.actionRequests")} />
              <QuickAction to="/calendar" icon={CalendarDays} label={t("today.actionCalendar")} />
              <QuickAction to="/messages" icon={MessageSquare} label={t("today.actionMessages")} />
            </div>
          </Section>

          <Section title={t("web.today.services")}>
            {d && d.services.length === 0 ? <EmptyState title={t("today.noServices")} /> : null}
            {d && d.services.length > 0 ? (
              <ListCard>
                {d.services.map((s) => (
                  <RowLink
                    key={s.serviceType}
                    to="/verification"
                    title={SERVICE_LABELS[s.serviceType]}
                    trailing={<StatusBadge status={s.verificationStatus} />}
                  />
                ))}
              </ListCard>
            ) : null}
          </Section>
        </div>
      </div>

      <EarningsCard />
    </Page>
  );
}

/** The things waiting on the coach, as large tappable cards. Hidden when nothing waits. */
function NeedsYou() {
  const { t } = useTranslation();
  const { waiting, unread } = useShellCounts();
  const reviews = useFormReviewsToDo();
  const items = [
    waiting > 0 && { to: "/clients/requests", icon: UserPlus, label: t("web.today.requestsWaiting", { count: waiting }) },
    unread > 0 && { to: "/messages", icon: MessageSquare, label: t("web.today.unreadWaiting", { count: unread }) },
    reviews > 0 && { to: "/form-reviews", icon: Clapperboard, label: t("web.today.reviewsWaiting", { count: reviews }) },
  ].filter(Boolean) as { to: string; icon: typeof UserPlus; label: string }[];
  if (items.length === 0) return null;
  return (
    <Section title={t("web.today.needsYou")}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className="group flex items-center gap-3 rounded-xl bg-primary/10 p-3.5 ring-1 ring-primary/25 transition-colors hover:bg-primary/15"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <i.icon className="size-4" />
            </span>
            <span className="flex-1 text-sm font-medium">{i.label}</span>
            <ArrowRight className="size-4 text-primary-ink transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </Section>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: typeof UserPlus; label: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="flex flex-col items-center gap-2 rounded-xl bg-card p-3 text-center text-sm font-medium ring-1 ring-foreground/10 transition-colors hover:bg-muted lg:flex-row lg:text-left"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="hidden size-4 text-muted-foreground lg:block" />
    </button>
  );
}

/** Relationships stuck activating: already flagged to support, shown so the coach knows. */
function StuckBanner({ items }: { items: StuckRelationshipItem[] }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="space-y-1">
          <p className="font-semibold">{t("notifications.stuckActivating")}</p>
          <p className="text-sm text-muted-foreground">{t("today.stuck", { count: items.length })}</p>
        </div>
      </div>
      <ul className="space-y-1 pl-8 text-sm">
        {items.map((item) => (
          <li key={item.relationshipId} className="flex justify-between gap-3">
            <span className="font-medium">
              {item.clientFullName} · {SERVICE_SHORT[item.serviceType] ?? item.serviceType}
            </span>
            <span className="text-muted-foreground">{timeAgo(item.stuckSince)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EarningsCard() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["professional-earnings"], queryFn: fetchEarnings });
  const empty = !!data && data.currentMonth.grossCents === 0 && data.lifetimePaidCents === 0 && data.settlements.length === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("today.earnings")}</CardTitle>
        <Link to="/earnings" className="text-sm font-medium text-primary-ink hover:underline">
          {t("web.today.viewEarnings")}
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Skeleton className="h-20 w-full" /> : null}
        {isError ? <ErrorState message={t("today.earningsError")} onRetry={() => refetch()} /> : null}
        {empty ? <p className="text-muted-foreground">{t("today.noEarningsYet")}</p> : null}
        {data && !empty ? (
          <>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("today.thisMonthNet")}
                  <StatusBadge status="pending" />
                </div>
                <div className="font-heading text-3xl font-bold tabular-nums">{money(data.currentMonth.netCents)}</div>
              </div>
              <div className="text-sm text-muted-foreground">
                <div>{t("today.grossLine", { gross: money(data.currentMonth.grossCents), pct: data.commissionPct })}</div>
                <div>{t("web.today.lifetimePaid", { amount: money(data.lifetimePaidCents) })}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("web.today.earningsNote")}</p>
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("today.settlementHistory")}</p>
              {data.settlements.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("today.noSettlements")}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {data.settlements.slice(0, 4).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div>
                        <div className="text-sm font-medium">{periodLabel(s.periodStart)}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("web.today.settlementGross", { gross: money(s.grossCents), pct: s.commissionPct })}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums">{money(s.netCents)}</span>
                        <StatusBadge status={s.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
