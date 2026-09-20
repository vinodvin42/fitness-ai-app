import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { fetchDashboardStats, fetchEarnings } from "../../api/professionalDashboard";
import { colors, spacing, typography } from "../../theme/tokens";

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const SERVICE_LABEL: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

/**
 * Stuck-relationship banner (Wave 3, 20 Sep 2026) — the honest signal this
 * coach app never had (see professionalDashboard.service.ts's
 * detectAndQueueStuckRelationships doc comment): a `Relationship` left at
 * `activating` after a real booking-creation failure doesn't show up in the
 * Clients list at all (professionalClients.service.ts only ever lists
 * `status: "active"` relationships), so before this, a coach had no way to
 * even know one of their would-be clients was stuck mid-activation. Mirrors
 * apps/user-mobile's own honest "not active yet" framing for the same
 * RelationshipStatus enum (ProfessionalRelationshipScreen.tsx) rather than
 * inventing new copy — this is presented as a real problem needing outside
 * help, not a retryable in-app action, because (unlike a failed Payment
 * activation) there's no retry endpoint for this: coaching.service.ts's own
 * createBooking doc comment treats a booking-creation failure as "needs a
 * human", the same discipline payments.service.ts's activatePayment()
 * explicitly carves booking OUT of its retry path for. An
 * AdminActionItem is already queued server-side by the time this renders
 * (the same dashboard read that returns this array creates it) — this
 * banner is the client-side half of that honesty, not a duplicate report.
 */
function StuckRelationshipsBanner({ items }: { items: { relationshipId: string; clientFullName: string; serviceType: string; stuckSince: string }[] }) {
  if (items.length === 0) return null;
  return (
    <Card style={{ borderColor: colors.warning, borderWidth: 1 }}>
      <Text style={{ color: colors.warning, ...typography.h2, marginBottom: spacing.xs }}>
        Needs attention — stuck activating
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm }}>
        {items.length === 1 ? "This client relationship" : `These ${items.length} client relationships`} didn't
        finish activating and won't show up under Clients yet. This has been flagged to PrimeFit support — no
        action is required from you, but reach out to support if you expected this to be resolved by now.
      </Text>
      <View style={{ gap: spacing.xs }}>
        {items.map((item) => (
          <View key={item.relationshipId} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
              {item.clientFullName} · {SERVICE_LABEL[item.serviceType] ?? item.serviceType}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{timeAgo(item.stuckSince)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function EarningsCard() {
  const { data } = useQuery({ queryKey: ["professional-earnings"], queryFn: fetchEarnings });
  if (!data) return null;
  return (
    <Card>
      <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Earnings</Text>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
            This month (net)
          </Text>
          <Text style={{ color: colors.textPrimary, ...typography.metricLarge }}>
            {money(data.currentMonth.netCents)}
          </Text>
        </View>
        <View style={{ justifyContent: "center" }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Gross {money(data.currentMonth.grossCents)} · {data.commissionPct}% platform fee
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Lifetime paid {money(data.lifetimePaidCents)}
          </Text>
        </View>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.sm }}>
        Gross is booking value for confirmed sessions this month — a priced session is charged through Razorpay
        before it's ever booked, so this is real collected revenue, not just delivered value.
      </Text>
    </Card>
  );
}

const SERVICE_LABELS: Record<ProfessionalServiceType, string> = {
  fitness: "Fitness Coaching",
  nutrition: "Nutrition Coaching",
};

const NOT_AVAILABLE_LABELS: Record<string, string> = {
  avgRating: "Avg. Rating",
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Coach Today screen (docs/coach/03-screen-inventory.md §C) — one real
 * screen backing all three Figma dashboard variants (fitness-only /
 * nutrition-only / combined), per professionalDashboard.service.ts's own
 * doc comment: service-scoped sections driven by `services`, no separate
 * screen per variant. Real: service verification badges, Active Clients (a
 * genuine `Relationship` count — no longer a permanently-zero placeholder as
 * of 25 Aug 2026's Discovery & Booking pass: confirming a booking in
 * apps/user-mobile now really does upsert a Relationship row, see
 * coaching.service.ts's `ensureRelationship`). **26 Aug 2026: Sessions/Wk
 * and Today's Schedule are real too** — both now join real `Booking` rows
 * (see professionalDashboard.service.ts's doc comment for the rolling-
 * 7-day / UTC-calendar-day definitions used, and CalendarScreen.tsx for
 * the full schedule this is a same-day preview of). Avg Rating still
 * needs an unbuilt Review model — the one item still in `notAvailable`.
 * Quick Actions (Create Workout Plan / Create Nutrition Plan / Schedule
 * Client Session) are likewise not wired — same "inert, not omitted"
 * precedent as apps/user-mobile's MoreScreen. "Schedule Client Session"
 * specifically is coach-initiated scheduling into a client's calendar,
 * which is a different, unbuilt flow from the consumer-initiated booking
 * apps/user-mobile's Coaching screens now do — not the same gap.
 *
 * **20 Sep 2026 (Wave 3):** renamed from `DashboardScreen`/"Dashboard" to
 * `TodayScreen`/"Today" — its real content (Today's Schedule, a same-day
 * preview) already matched the R1 work package's required tab name; only
 * the tab label and file/export name were stale, not the screen itself.
 * See MainTabs.tsx's own doc comment for the rest of this wave's tab
 * restructure. Also gained the stuck-relationship banner below — see
 * StuckRelationshipsBanner's own doc comment.
 */
export function TodayScreen() {
  const { professional, logout } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["professional-dashboard-stats"],
    queryFn: fetchDashboardStats,
  });

  return (
    <ScreenContainer title="Today">
      <View>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{professional?.fullName}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>{professional?.email}</Text>
      </View>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.stuckRelationships.length > 0 && <StuckRelationshipsBanner items={data.stuckRelationships} />}

      {data && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {data.services.length === 0 ? (
              <Card style={{ flex: 1 }}>
                <Text style={{ color: colors.textSecondary }}>No services selected yet.</Text>
              </Card>
            ) : (
              data.services.map((s) => (
                <Card key={s.serviceType} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}>
                    {SERVICE_LABELS[s.serviceType]}
                  </Text>
                  <StatusBadge status={s.verificationStatus} />
                </Card>
              ))
            )}
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Card style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Active Clients
              </Text>
              <Text style={{ color: colors.textPrimary, ...typography.metricLarge, marginTop: spacing.xs }}>
                {data.activeClients}
              </Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Sessions This Week
              </Text>
              <Text style={{ color: colors.textPrimary, ...typography.metricLarge, marginTop: spacing.xs }}>
                {data.sessionsThisWeek}
              </Text>
            </Card>
          </View>

          <Card>
            <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>
              Today's Schedule
            </Text>
            {data.todaysSchedule.length === 0 ? (
              <Text style={{ color: colors.textSecondary }}>No sessions scheduled today.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {data.todaysSchedule.map((item) => (
                  <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{item.clientFullName}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.offeringLabel}</Text>
                    </View>
                    <Text style={{ color: colors.textPrimary }}>{timeLabel(item.scheduledAt)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <EarningsCard />

          <Card>
            <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Quick Actions</Text>
            <View style={{ gap: spacing.xs }}>
              <Text style={{ color: colors.textMuted }}>Create Workout Plan — not built yet</Text>
              <Text style={{ color: colors.textMuted }}>Create Nutrition Plan — not built yet</Text>
              <Text style={{ color: colors.textMuted }}>Schedule Client Session — not built yet</Text>
            </View>
          </Card>

          {data.notAvailable.length > 0 && (
            <Card style={{ borderStyle: "dashed" }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Not available yet
              </Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
                Avg. Rating has no backing entity anywhere in this build — no Review model exists yet.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
                {data.notAvailable.map((key) => (
                  <View
                    key={key}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 999,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{NOT_AVAILABLE_LABELS[key] ?? key}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </>
      )}

      <Text
        onPress={() => logout()}
        style={{ color: colors.textSecondary, textAlign: "center", marginTop: spacing.md, textDecorationLine: "underline" }}
      >
        Log Out
      </Text>
    </ScreenContainer>
  );
}
