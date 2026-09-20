import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  CoachClientProfile,
  CoachClientSummary,
  CoachClientSummaryBodyMeasurement,
  CoachClientSummaryCheckIn,
  CoachClientSummaryMealLog,
  CoachClientSummaryWorkoutSession,
  CoachScheduleItem,
} from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchClientProfile, fetchClientSummary } from "../../api/professionalClients";
import type { ClientsStackParamList } from "../../navigation/ClientsStack";
import { colors, spacing, typography } from "../../theme/tokens";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };
const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sessionLine(item: CoachScheduleItem): string {
  const when = new Date(item.scheduledAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const svc = item.serviceType ? ` · ${SERVICE_LABELS[item.serviceType] ?? item.serviceType}` : "";
  return `${when} · ${item.offeringLabel}${svc}`;
}

/**
 * Client Profile detail (docs/coach/03-screen-inventory.md §D), added 31 Aug
 * 2026. Real coaching-relevant onboarding fields (goals, training level,
 * diet) plus real session history from `Booking`. Onboarding's own
 * sensitive fields (age/weight/height/medical/injuries) stay withheld
 * behind an honest "not available" card — see
 * apps/api's professionalClients.service.ts doc comment for why (Module
 * 02's `SensitiveDataAccessRequest`-style boundary, not a coach-facing flow).
 *
 * **Wave 2 (20 Sep 2026): Client 360 added.** `ClientSummarySection` below
 * now surfaces real Training/Nutrition/Check-ins/Body-measurement
 * summaries from GET /professionals/me/clients/:userId/summary — but ONLY
 * once the client has granted `health_data_processing` Consent, checked
 * server-side (see professionalClients.service.ts's getClientSummary).
 * `consentGranted: false` renders a real, honest "hasn't enabled data
 * sharing yet" card instead of a blank/broken-looking section.
 */
export function ClientProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ClientsStackParamList, "ClientProfile">>();
  const route = useRoute<RouteProp<ClientsStackParamList, "ClientProfile">>();
  const { userId, fullName } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-client", userId],
    queryFn: () => fetchClientProfile(userId),
  });

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["coach-client-summary", userId],
    queryFn: () => fetchClientSummary(userId),
  });

  return (
    <ScreenContainer title={fullName}>
      <Text
        onPress={() => navigation.goBack()}
        style={{ color: colors.accent, fontWeight: "600", marginBottom: spacing.xs }}
      >
        ‹ Clients
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && (
        <>
          <ClientProfileBody profile={data} />
          <Button
            label="Review Recommendations"
            variant="secondary"
            onPress={() => navigation.navigate("ClientRecommendations", { userId, fullName })}
          />
        </>
      )}

      {isSummaryLoading && <ActivityIndicator color={colors.accent} />}
      {isSummaryError && <ErrorState onRetry={() => refetchSummary()} message="Couldn't load this client's activity." />}
      {summary && <ClientSummarySection summary={summary} />}
    </ScreenContainer>
  );
}

/**
 * Client 360 (Wave 2, 20 Sep 2026) — real Assessment/Training/Nutrition/
 * Check-in sections, sourced from GET /professionals/me/clients/:userId/summary.
 * Gated server-side on the client's own `health_data_processing` Consent —
 * `consentGranted: false` renders a clear, honest, non-alarming message
 * rather than a broken-looking empty state. See
 * apps/api's professionalClients.service.ts's getClientSummary doc comment.
 */
function ClientSummarySection({ summary }: { summary: CoachClientSummary }) {
  if (!summary.consentGranted) {
    return (
      <Card style={{ borderStyle: "dashed" }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.xs }}>Client activity</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          This client hasn&apos;t enabled data sharing with their coach yet, so training, nutrition, and check-in
          activity aren&apos;t shown here. They can turn this on anytime from their own Privacy settings.
        </Text>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Training</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
          {summary.training.completedCount} of {summary.training.totalCount} recent sessions completed
        </Text>
        {summary.training.recentSessions.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No workout sessions in the last 30 days.</Text>
        ) : (
          summary.training.recentSessions.map((s) => <WorkoutSessionRow key={s.id} session={s} />)
        )}
      </Card>

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Nutrition</Text>
        {summary.nutrition.recentLogs.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No meal logs in the last 30 days.</Text>
        ) : (
          summary.nutrition.recentLogs.map((m) => <MealLogRow key={m.id} log={m} />)
        )}
      </Card>

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Check-ins</Text>
        {summary.checkIns.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No check-ins in the last 30 days.</Text>
        ) : (
          summary.checkIns.map((c) => <CheckInRow key={c.id} checkIn={c} />)
        )}
      </Card>

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Body measurements</Text>
        {summary.bodyMeasurements.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No measurements logged in the last 30 days.</Text>
        ) : (
          summary.bodyMeasurements.map((b) => <BodyMeasurementRow key={b.id} measurement={b} />)
        )}
      </Card>

      {summary.notAvailable.length > 0 && (
        <Card style={{ borderStyle: "dashed" }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Not available
          </Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
            Progress photos and AI coach conversation content aren&apos;t shown to coaches.
          </Text>
        </Card>
      )}
    </>
  );
}

function WorkoutSessionRow({ session }: { session: CoachClientSummaryWorkoutSession }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textPrimary, flexShrink: 1 }}>{session.workoutName ?? "Workout"}</Text>
      <Text style={{ color: session.status === "completed" ? colors.textSecondary : colors.textMuted, fontSize: 12 }}>
        {session.status} · {dateLabel(session.startedAt)}
      </Text>
    </View>
  );
}

function MealLogRow({ log }: { log: CoachClientSummaryMealLog }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textPrimary }}>
        {log.mealType} · {log.calories} kcal
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dateLabel(log.loggedAt)}</Text>
    </View>
  );
}

function CheckInRow({ checkIn }: { checkIn: CoachClientSummaryCheckIn }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textPrimary }}>
        Energy {checkIn.energy} · Soreness {checkIn.soreness} · Adherence {checkIn.adherence}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dateLabel(checkIn.createdAt)}</Text>
    </View>
  );
}

function BodyMeasurementRow({ measurement }: { measurement: CoachClientSummaryBodyMeasurement }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textPrimary }}>
        {measurement.weightKg != null ? `${measurement.weightKg} kg` : "Weight not set"}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dateLabel(measurement.loggedAt)}</Text>
    </View>
  );
}

function ClientProfileBody({ profile }: { profile: CoachClientProfile }) {
  return (
    <>
      <Card style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" }}>
        {profile.serviceTypes.map((s) => (
          <View
            key={s}
            style={{
              backgroundColor: "rgba(99,102,241,0.15)",
              borderRadius: 999,
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
              {SERVICE_LABELS[s] ?? s}
            </Text>
          </View>
        ))}
        <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: "auto" }}>
          Client since {dateLabel(profile.activeSince)}
        </Text>
      </Card>

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Coaching profile</Text>
        <ProfileRow label="Goals" value={profile.coaching.goals.length ? profile.coaching.goals.join(", ") : "Not set"} />
        <ProfileRow
          label="Training level"
          value={
            profile.coaching.trainingLevel
              ? LEVEL_LABELS[profile.coaching.trainingLevel] ?? profile.coaching.trainingLevel
              : "Not set"
          }
        />
        <ProfileRow label="Diet" value={profile.coaching.dietType ?? "Not set"} />
      </Card>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Sessions</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{profile.sessions.totalCompleted} completed</Text>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Upcoming
        </Text>
        {profile.sessions.upcoming.length === 0 ? (
          <Text style={{ color: colors.textSecondary, marginTop: 2 }}>None scheduled.</Text>
        ) : (
          profile.sessions.upcoming.map((item) => (
            <Text key={item.id} style={{ color: colors.textPrimary, marginTop: 2 }}>
              {sessionLine(item)}
            </Text>
          ))
        )}

        {profile.sessions.past.length > 0 && (
          <>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: spacing.sm,
              }}
            >
              Recent
            </Text>
            {profile.sessions.past.map((item) => (
              <Text
                key={item.id}
                style={{ color: item.status === "cancelled" ? colors.textMuted : colors.textSecondary, marginTop: 2 }}
              >
                {sessionLine(item)}
                {item.status === "cancelled" ? " (cancelled)" : ""}
              </Text>
            ))}
            {profile.sessions.pastTruncated ? (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.xs }}>
                Showing the most recent 50 sessions.
              </Text>
            ) : null}
          </>
        )}
      </Card>

      {profile.notAvailable.length > 0 && (
        <Card style={{ borderStyle: "dashed" }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Not available
          </Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
            Sensitive health data (age, weight, height, medical conditions, injuries) isn't shown to coaches — it's
            gated behind a consent workflow this build doesn't have yet.
          </Text>
        </Card>
      )}
    </>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, flexShrink: 1, textAlign: "right", marginLeft: spacing.md }}>
        {value}
      </Text>
    </View>
  );
}
