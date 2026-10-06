import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchMyTeam } from "../../api/coaching";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MyProfessionalTeam">;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function serviceLabel(serviceType: string) {
  return serviceType === "fitness" ? "Fitness Coaching" : "Nutrition Coaching";
}

/**
 * My Professional Team (docs/coach/03-screen-inventory.md §E) — real
 * active `Relationship` rows with real last/next session dates computed
 * from `Booking`, plus a real "Recommended Professionals" section (see
 * coaching.service.ts's `listMyTeam`). **31 Aug 2026: "Message" is real
 * now** — it opens a real Coach ↔ Client thread (see MessageThreadScreen
 * and apps/api's coachMessages.service.ts), replacing the previously-inert
 * "not built yet" label. The settings-gear action routes to Change
 * Professional.
 */
export function MyProfessionalTeamScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "team"],
    queryFn: fetchMyTeam,
  });

  if (isLoading) {
    return (
      <ScreenContainer title="My Professional Team">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title="My Professional Team">
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="My Professional Team">
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button label="Sessions" variant="secondary" onPress={() => navigation.navigate("CoachSessions")} style={{ height: 40, flex: 1 }} />
        <Button label="Quotes" variant="secondary" onPress={() => navigation.navigate("Quotes")} style={{ height: 40, flex: 1 }} />
      </View>
      {data.team.length === 0 ? (
        <EmptyState
          title="No coaches yet"
          subtitle="Book a session with a coach and they'll show up here."
          actionLabel="Find a Coach"
          onAction={() => navigation.navigate("CoachDiscovery", undefined)}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text
            onPress={() => navigation.navigate("Conversations")}
            style={{ color: colors.accent, fontFamily: fonts.bodySemi, alignSelf: "flex-end" }}
          >
            All messages ›
          </Text>
          {data.team.map((member) => (
            <Card key={member.relationshipId}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{member.professionalFullName}</Text>
              <Text style={{ color: colors.accent, ...typography.meta, marginTop: 2 }}>
                {serviceLabel(member.serviceType)}
              </Text>
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                Last session {formatDate(member.lastSessionAt)} · Next session {formatDate(member.nextSessionAt)}
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "center" }}>
                <Button
                  label="Book Session"
                  variant="secondary"
                  onPress={() => navigation.navigate("BookingServiceSelection", { professionalId: member.professionalId })}
                  style={{ height: 40, flex: 1 }}
                />
                <Button
                  label="Message"
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate("MessageThread", {
                      professionalId: member.professionalId,
                      fullName: member.professionalFullName,
                    })
                  }
                  style={{ height: 40, flex: 1 }}
                />
                <Button
                  label="Change"
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate("ChangeProfessional", {
                      relationshipId: member.relationshipId,
                      professionalFullName: member.professionalFullName,
                      serviceType: member.serviceType,
                    })
                  }
                  style={{ height: 40, flex: 1 }}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      {data.recommended.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>
            Recommended Professionals
          </Text>
          {data.recommended.map((coach) => (
            <Card key={coach.id} style={{ marginBottom: spacing.sm }}>
              <Text style={{ color: colors.textPrimary }}>{coach.fullName}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                {coach.yearsExperience != null ? `${coach.yearsExperience} yrs experience` : "Experience not listed"}
              </Text>
              <Button
                label="View Profile"
                variant="secondary"
                onPress={() => navigation.navigate("CoachProfileDetail", { professionalId: coach.id })}
                style={{ marginTop: spacing.sm, height: 40 }}
              />
            </Card>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}
