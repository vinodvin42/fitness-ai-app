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

function periodLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Earnings card (31 Aug 2026, polished 20 Sep 2026 — Wave 3 earnings-view
 * gap pass). Backing endpoint (professionalDashboard.service.ts's
 * getEarnings) has always returned a `settlements` history array typed by
 * `CoachEarningsResponse` (packages/types), but this card only ever
 * rendered `currentMonth` and `lifetimePaidCents` — the real per-period
 * breakdown existed in the data and was simply never drawn. Also added:
 * this card's own loading/error handling (previously `if (!data) return
 * null`, so a slow or failed fetch just silently omitted the whole card —
 * inconsistent with DashboardScreen's own stats query just above it,
 * which already uses ActivityIndicator/ErrorState), an honest "no
 * earnings yet" empty state for a brand-new coach, and a "Pending"
 * badge — reusing StatusBadge, now extended with a `paid` tone/label to
 * match `PayoutStatus` (schema.prisma) — making clear the current
 * month's total is provisional collected revenue, not yet turned into a
 * settlement (that only happens once the month closes; see
 * adminSettlements.service.ts). `CoachSettlement.status` itself is a
 * strict pending -> paid lifecycle (no partial/failed state exists), so
 * this is the full state space, not a subset.
 */
function EarningsCard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["professional-earnings"],
    queryFn: fetchEarnings,
  });

  const hasNoEarningsYet =
    !!data && data.currentMonth.grossCents === 0 && data.lifetimePaidCents === 0 && data.settlements.length === 0;

  return (
    <Card>
      <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Earnings</Text>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && (
        <ErrorState
          message="Couldn't load your earnings. Check your connection and try again."
          onRetry={() => refetch()}
        />
      )}

      {data && hasNoEarningsYet && (
        <Text style={{ color: colors.textSecondary }}>
          No earnings yet — this fills in once your first confirmed, paid booking lands.
        </Text>
      )}

      {data && !hasNoEarningsYet && (
        <>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                <Text
                  style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  This month (net)
                </Text>
                <StatusBadge status="pending" />
              </View>
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
            before it's ever booked, so this is real collected revenue, not just delivered value. It's still
            pending, though: this month's total becomes a real settlement only once the month closes.
          </Text>

          <View style={{ marginTop: spacing.md }}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: spacing.xs,
              }}
            >
              Settlement History
            </Text>
            {data.settlements.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                No settlements yet — your first one is created once a full month of bookings closes out.
              </Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {data.settlements.map((s) => (
                  <View
                    key={s.id}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 13 }}>
                        {periodLabel(s.periodStart)}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        Gross {money(s.grossCents)} · {s.commissionPct}% fee
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{money(s.netCents)}</Text>
                      <StatusBadge status={s.status} />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      )}
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
 * Coach Dashboard (docs/coach/03-screen-inventory.md §C) — one real screen
 * backing all three Figma dashboard variants (fitness-only / nutrition-only
 * / combined), per professionalDashboard.service.ts's own doc comment:
 * service-scoped sections driven by `services`, no separate screen per
 * variant. Real: service verification badges, Active Clients (a genuine
 * `Relationship` count — no longer a permanently-zero placeholder as of
 * 25 Aug 2026's Discovery & Booking pass: confirming a booking in
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
 */
export function DashboardScreen() {
  const { professional, logout } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["professional-dashboard-stats"],
    queryFn: fetchDashboardStats,
  });

  return (
    <ScreenContainer title="Dashboard">
      <View>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{professional?.fullName}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>{professional?.email}</Text>
      </View>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

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
