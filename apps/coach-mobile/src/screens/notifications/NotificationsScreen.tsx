import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchDashboardStats } from "../../api/professionalDashboard";
import { fetchPendingRelationships } from "../../api/relationshipRequests";
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
 */
export function NotificationsScreen() {
  const navigation = useNavigation();

  const dashboardQuery = useQuery({ queryKey: ["professional-dashboard-stats"], queryFn: fetchDashboardStats });
  const pendingQuery = useQuery({ queryKey: ["coach-pending-requests"], queryFn: fetchPendingRelationships });

  const isLoading = dashboardQuery.isLoading || pendingQuery.isLoading;
  const isError = dashboardQuery.isError || pendingQuery.isError;

  const stuck = dashboardQuery.data?.stuckRelationships ?? [];
  const pending = pendingQuery.data?.requests ?? [];
  const isEmpty = !isLoading && !isError && stuck.length === 0 && pending.length === 0;

  return (
    <ScreenContainer title="Notifications" showAlerts={false}>
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        ‹ Back
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      {isError && (
        <ErrorState
          onRetry={() => {
            dashboardQuery.refetch();
            pendingQuery.refetch();
          }}
        />
      )}

      {isEmpty && (
        <EmptyState title="Nothing needs your attention" subtitle="Pending requests and account issues will show up here." />
      )}

      {pending.length > 0 && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Pending client requests</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Open the Clients tab's "Pending Requests" to accept or decline.
          </Text>
          {pending.map((item) => (
            <Card key={item.relationshipId}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{item.userFullName}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {SERVICE_LABEL[item.serviceType] ?? item.serviceType} · Requested {timeAgo(item.createdAt)}
              </Text>
            </Card>
          ))}
        </View>
      )}

      {stuck.length > 0 && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Text style={{ color: colors.warning, ...typography.h2 }}>Needs attention — stuck activating</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Already flagged to FynroX support — no action required from you.
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
