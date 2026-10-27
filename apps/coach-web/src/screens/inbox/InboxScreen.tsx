import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellOff, CalendarPlus, ChevronRight, Gift, UserPlus } from "lucide-react";
import type { CoachNewBookingItem } from "@fitness-ai-app/types";
import { fetchConversations } from "@/api/coachMessages";
import { fetchDashboardStats } from "@/api/professionalDashboard";
import { fetchProfessionalOffers } from "@/api/professionalOffers";
import { fetchPendingRelationships } from "@/api/relationshipRequests";
import { EmptyState, ErrorState, ListCard, ListSkeleton, Page, PageHeader, RowLink, Section } from "@/components/page";
import { initials } from "@/components/shell/AccountMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCoachAlerts, useMarkBookingsSeen } from "@/lib/coachAlerts";
import { dateTimeLabel, SERVICE_SHORT, timeAgo } from "@/lib/format";
import { ActivityFeed } from "./ActivityFeed";

const chevron = <ChevronRight className="size-4 shrink-0 text-muted-foreground" />;

function SectionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="shrink-0 text-sm font-medium text-primary-ink hover:underline">
      {label}
    </Link>
  );
}

function Leading({ name, icon: Icon }: { name?: string; icon?: typeof UserPlus }) {
  if (Icon) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Avatar size="lg" className="size-9">
      <AvatarFallback className="text-xs font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Inbox, ported from apps/coach-mobile's NotificationsScreen. There is no
 * notification model: it gathers the real signals a coach can act on —
 * unread client messages, pending client requests, open Fynrox offers,
 * bookings made since the coach last opened the inbox (GET
 * /professionals/me/alerts) and relationships stuck activating (already
 * flagged to support). Opening it marks those bookings seen, so the badge
 * drops; the list stays up until the coach leaves.
 */
export function InboxScreen() {
  const { t } = useTranslation();

  const dashboardQuery = useQuery({ queryKey: ["professional-dashboard-stats"], queryFn: fetchDashboardStats });
  const pendingQuery = useQuery({ queryKey: ["coach-pending-requests"], queryFn: fetchPendingRelationships });
  // Same key and filter as the Requests screen's "Offers from Fynrox".
  const offersQuery = useQuery({
    queryKey: ["coach-professional-offers"],
    queryFn: () => fetchProfessionalOffers("offered"),
  });
  const conversationsQuery = useQuery({ queryKey: ["coach-conversations"], queryFn: fetchConversations });
  const alertsQuery = useCoachAlerts();
  const markBookingsSeen = useMarkBookingsSeen();

  // New bookings: read fresh when the screen opens, kept for this visit, then marked seen.
  const [newBookings, setNewBookings] = useState<{ items: CoachNewBookingItem[]; total: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void alertsQuery.refetch().then((result) => {
      if (cancelled || result.isError || !result.data) return;
      setNewBookings({ items: result.data.newBookings, total: result.data.newBookingCount });
      void markBookingsSeen(result.data.asOf);
    });
    return () => {
      cancelled = true;
    };
    // Once per visit, on purpose: a re-run would mark the next bookings seen unshown.
  }, []);

  const queries = [dashboardQuery, pendingQuery, offersQuery, conversationsQuery];
  const isLoading = queries.some((q) => q.isLoading) || (alertsQuery.isLoading && !newBookings);
  const isError = queries.some((q) => q.isError) || (alertsQuery.isError && !newBookings);

  const stuck = dashboardQuery.data?.stuckRelationships ?? [];
  const pending = pendingQuery.data?.requests ?? [];
  const offers = offersQuery.data?.offers ?? [];
  const unreadConversations = (conversationsQuery.data?.conversations ?? []).filter((c) => c.unreadCount > 0);
  const unread = unreadConversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const bookings = newBookings?.items ?? [];
  const isEmpty =
    !isLoading &&
    !isError &&
    stuck.length === 0 &&
    pending.length === 0 &&
    offers.length === 0 &&
    unread === 0 &&
    bookings.length === 0;

  return (
    <Page>
      <PageHeader title={t("web.nav.inbox")} description={t("web.comms.inboxDescription")} />

      {isLoading ? <ListSkeleton rows={4} /> : null}
      {isError ? (
        <ErrorState
          onRetry={() => {
            queries.forEach((q) => void q.refetch());
            void alertsQuery.refetch();
          }}
        />
      ) : null}

      {isEmpty ? <EmptyState icon={BellOff} title={t("notifications.emptyTitle")} description={t("notifications.emptySubtitle")} className="py-6" /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {unread > 0 ? (
          <Section
            title={t("notifications.unreadTitle")}
            description={t("notifications.unreadCount", { count: unread })}
            actions={<SectionLink to="/messages" label={t("notifications.openMessages")} />}
          >
            <ListCard>
              {unreadConversations.map((c) => (
                <RowLink
                  key={c.partnerId}
                  to={`/messages/${c.partnerId}`}
                  leading={<Leading name={c.partnerName} />}
                  title={c.partnerName}
                  subtitle={c.lastMessage ?? undefined}
                  trailing={
                    <span className="flex items-center gap-2">
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums">
                        <span aria-hidden>{c.unreadCount}</span>
                        <span className="sr-only">{t("web.comms.unreadBadge", { count: c.unreadCount })}</span>
                      </span>
                      {chevron}
                    </span>
                  }
                />
              ))}
            </ListCard>
          </Section>
        ) : null}

        {pending.length > 0 ? (
          <Section
            title={t("notifications.pendingRequests")}
            actions={<SectionLink to="/clients/requests" label={t("notifications.reviewRequests")} />}
          >
            <ListCard>
              {pending.map((item) => (
                <RowLink
                  key={item.relationshipId}
                  to="/clients/requests"
                  leading={<Leading icon={UserPlus} />}
                  title={item.userFullName}
                  subtitle={`${SERVICE_SHORT[item.serviceType] ?? item.serviceType} · ${t("web.comms.requestedAgo", { ago: timeAgo(item.requestedAt ?? item.createdAt) })}`}
                  trailing={chevron}
                />
              ))}
            </ListCard>
          </Section>
        ) : null}

        {offers.length > 0 ? (
          <Section
            title={t("notifications.offersTitle")}
            actions={<SectionLink to="/clients/offers" label={t("notifications.reviewOffers")} />}
          >
            <ListCard>
              {offers.map((offer) => (
                <RowLink
                  key={offer.offerId}
                  to="/clients/offers"
                  leading={<Leading icon={Gift} />}
                  title={offer.userFullName}
                  subtitle={`${SERVICE_SHORT[offer.serviceType] ?? offer.serviceType} · ${t("notifications.offeredAgo", { ago: timeAgo(offer.createdAt) })}`}
                  trailing={chevron}
                />
              ))}
            </ListCard>
          </Section>
        ) : null}

        {bookings.length > 0 && newBookings ? (
          <Section
            title={t("notifications.newBookings")}
            description={t("web.comms.newBookingsHint")}
            actions={<SectionLink to="/calendar" label={t("notifications.openCalendar")} />}
          >
            <ListCard>
              {bookings.map((booking) => (
                // Each row opens that client.
                <RowLink
                  key={booking.id}
                  to={`/clients/${booking.clientId}`}
                  leading={<Leading icon={CalendarPlus} />}
                  title={booking.clientFullName}
                  subtitle={`${booking.offeringLabel} · ${dateTimeLabel(booking.scheduledAt)}`}
                  trailing={
                    <span className="flex items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {t("notifications.bookedAgo", { ago: timeAgo(booking.bookedAt) })}
                      </span>
                      {chevron}
                    </span>
                  }
                />
              ))}
            </ListCard>
            {newBookings.total > bookings.length ? (
              <p className="text-sm text-muted-foreground">
                {t("notifications.moreBookings", { count: newBookings.total - bookings.length })}
              </p>
            ) : null}
          </Section>
        ) : null}

        {stuck.length > 0 ? (
          <Section
            className="lg:col-span-2"
            title={
              <span className="flex items-center gap-2 text-warning">
                <AlertTriangle className="size-4" />
                {t("notifications.stuckActivating")}
              </span>
            }
            description={t("notifications.alreadyFlagged")}
          >
            {/* Informational: support already has these, and the item carries no client id to open. */}
            <ListCard className="ring-warning/40">
              {stuck.map((item) => (
                <RowLink
                  key={item.relationshipId}
                  leading={<Leading name={item.clientFullName} />}
                  title={item.clientFullName}
                  subtitle={`${SERVICE_SHORT[item.serviceType] ?? item.serviceType} · ${t("web.comms.stuckSince", { ago: timeAgo(item.stuckSince) })}`}
                  className="hover:bg-transparent"
                />
              ))}
            </ListCard>
          </Section>
        ) : null}
      </div>

      <ActivityFeed />
    </Page>
  );
}
