import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { CoachClientProfile, CoachScheduleItem } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { fetchClientProfile } from "../../api/professionalClients";
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
 * diet) plus real session history from `Booking`. Sensitive health data
 * (age/weight/height/medical/injuries) is deliberately withheld behind an
 * honest "not available" card — see apps/api's professionalClients.service.ts
 * doc comment for why (no coach-facing consent workflow exists in this build).
 */
export function ClientProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ClientsStackParamList, "ClientProfile">>();
  const { userId, fullName } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-client", userId],
    queryFn: () => fetchClientProfile(userId),
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

      {data && <ClientProfileBody profile={data} />}
    </ScreenContainer>
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
