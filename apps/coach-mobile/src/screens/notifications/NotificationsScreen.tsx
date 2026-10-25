import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import type { CoachNewBookingItem } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchDashboardStats } from "../../api/professionalDashboard";
import { fetchPendingRelationships } from "../../api/relationshipRequests";
import { fetchProfessionalOffers } from "../../api/professionalOffers";
import { fetchConversations } from "../../api/coachMessages";
import { useCoachAlerts, useMarkBookingsSeen } from "../../lib/coachAlerts";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { colors, spacing, typography } from "../../theme/tokens";

const SERVICE_LABEL: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Same day and time format as the Calendar tab's rows. */
function sessionLabel(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function SectionLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text onPress={onPress} accessibilityRole="link" style={{ color: colors.accent, fontWeight: "600", fontSize: 13 }}>
      {label}
    </Text>
  );
}

/**
 * Global Notifications screen (Wave 3, 20 Sep 2026) — reached from the
 * "Alerts" button ScreenContainer.tsx now renders in every screen's header,
 * the honest minimal equivalent of apps/user-mobile's own AI/notification
 * touchpoints (that app has neither a persistent global header icon nor a
 * real Notification-model-backed feed either — its "AI is global" claim
 * (MainTabs.tsx's own doc comment) means reachable from Today's banner +
 * More's Recover row, and its own NotificationSettingsScreen is push-
 * reminder-scheduling *preferences*, not an inbox of actual notifications).
 * No Notification model exists anywhere in this codebase's schema.prisma —
 * this screen doesn't invent one or a fake feed. It aggregates exactly two
 * REAL, already-built, already-polled signals a coach can act on today,
 * both already shown elsewhere in this app (Clients tab banner / Today
 * banner) and just surfaced here too for one predictable global entry
 * point:
 *   1. Pending client requests (relationshipRequests.ts — real
 *      `requested`-status Relationships waiting on Accept/Decline).
 *   2. Stuck-activating relationships (professionalDashboard.ts's
 *      `stuckRelationships` — see TodayScreen.tsx's StuckRelationshipsBanner
 *      doc comment).
 * A coach-facing AI assistant is explicitly NOT built here — no coach-facing
 * AI conversation flow exists anywhere in apps/api's aiClient.ts callers
 * today (AI Coach is a USER-facing feature only), so building one from
 * scratch just for this affordance would be exactly the "fake screen to
 * check a box" this wave was told not to do. See docs/coach/
 * 07-open-questions-gaps.md's dated entry for this as its own explicit,
 * larger gap.
 *
 * **25 Oct 2026 (coach communication audit B2):** the coach was never told
 * about a new booking or Fynrox offer, and this screen said "Nothing needs
 * your attention" with client messages unread. It now also lists unread
 * messages (the Messages tab's polled query), open Fynrox offers (the same
 * query Pending Requests shows), and bookings made since the coach last
 * opened this screen (GET /professionals/me/alerts). Opening the screen
 * marks those bookings seen, so the header badge drops; the list stays up
 * until the coach leaves. There is still no inbox model: the owner hasn't
 * approved a schema change for one, and requests and offers already clear
 * themselves when the coach answers them.
 */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const dashboardQuery = useQuery({ queryKey: ["professional-dashboard-stats"], queryFn: fetchDashboardStats });
  const pendingQuery = useQuery({ queryKey: ["coach-pending-requests"], queryFn: fetchPendingRelationships });
  // Same key and filter as PendingRequestsScreen's "Offers from Fynrox".
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
  const unread = (conversationsQuery.data?.conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0);
  const bookings = newBookings?.items ?? [];
  const isEmpty =
    !isLoading &&
    !isError &&
    stuck.length === 0 &&
    pending.length === 0 &&
    offers.length === 0 &&
    unread === 0 &&
    bookings.length === 0;

  const openPendingRequests = () =>
    navigation.navigate("Main", { screen: "Clients", params: { screen: "PendingRequests" } });

  return (
    <ScreenContainer title={t("notifications.title")} showAlerts={false}>
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        ‹ Back
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      {isError && (
        <ErrorState
          onRetry={() => {
            queries.forEach((q) => q.refetch());
            alertsQuery.refetch();
          }}
        />
      )}

      {isEmpty && (
        <EmptyState title={t("notifications.emptyTitle")} subtitle={t("notifications.emptySubtitle")} />
      )}

      {unread > 0 && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("notifications.unreadTitle")}</Text>
          <Card>
            <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
              {t("notifications.unreadCount", { count: unread })}
            </Text>
          </Card>
          <SectionLink
            label={t("notifications.openMessages")}
            onPress={() => navigation.navigate("Main", { screen: "Messages" })}
          />
        </View>
      )}

      {pending.length > 0 && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("notifications.pendingRequests")}</Text>
          {pending.map((item) => (
            <Card key={item.relationshipId}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{item.userFullName}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {SERVICE_LABEL[item.serviceType] ?? item.serviceType} · Requested {timeAgo(item.requestedAt ?? item.createdAt)}
              </Text>
            </Card>
          ))}
          <SectionLink label={t("notifications.reviewRequests")} onPress={openPendingRequests} />
        </View>
      )}

      {offers.length > 0 && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("notifications.offersTitle")}</Text>
          {offers.map((offer) => (
            <Card key={offer.offerId}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{offer.userFullName}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {SERVICE_LABEL[offer.serviceType] ?? offer.serviceType} · {t("notifications.offeredAgo", { ago: timeAgo(offer.createdAt) })}
              </Text>
            </Card>
          ))}
          <SectionLink label={t("notifications.reviewOffers")} onPress={openPendingRequests} />
        </View>
      )}

      {bookings.length > 0 && newBookings && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("notifications.newBookings")}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t("notifications.newBookingsHint")}</Text>
          {bookings.map((booking) => (
            <Card key={booking.id}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{booking.clientFullName}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {booking.offeringLabel} · {sessionLabel(booking.scheduledAt)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                {t("notifications.bookedAgo", { ago: timeAgo(booking.bookedAt) })}
              </Text>
            </Card>
          ))}
          {newBookings.total > bookings.length && (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {t("notifications.moreBookings", { count: newBookings.total - bookings.length })}
            </Text>
          )}
          <SectionLink
            label={t("notifications.openCalendar")}
            onPress={() => navigation.navigate("Main", { screen: "Calendar" })}
          />
        </View>
      )}

      {stuck.length > 0 && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text style={{ color: colors.warning, ...typography.h2 }}>{t("notifications.stuckActivating")}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            {t("notifications.alreadyFlagged")}
          </Text>
          {stuck.map((item) => (
            <Card key={item.relationshipId} style={{ borderColor: colors.warning, borderWidth: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{item.clientFullName}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {SERVICE_LABEL[item.serviceType] ?? item.serviceType} · Stuck since {timeAgo(item.stuckSince)}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
