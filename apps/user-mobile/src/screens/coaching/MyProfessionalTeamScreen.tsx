import React from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "team"],
    queryFn: fetchMyTeam,
  });

  if (isLoading) {
    return (
      <ScreenContainer title={t("coaching.team.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title={t("coaching.team.title")}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t("coaching.team.title")}>
      {data.team.length === 0 ? (
        <EmptyState
          title={t("coaching.team.emptyTitle")}
          subtitle={t("coaching.team.emptySubtitle")}
          actionLabel={t("coaching.team.findCoach")}
          onAction={() => navigation.navigate("CoachDiscovery", undefined)}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.md }}>
            <Text
              onPress={() => navigation.navigate("CoachSessions")}
              accessibilityRole="link"
              style={{ color: colors.accent, fontFamily: fonts.bodySemi }}
            >
              Sessions
            </Text>
            <Text
              onPress={() => navigation.navigate("Conversations")}
              style={{ color: colors.accent, fontFamily: fonts.bodySemi }}
            >
              {t("coaching.team.allMessages")}
            </Text>
          </View>
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
                  label={t("coaching.team.bookSession")}
                  variant="secondary"
                  onPress={() => navigation.navigate("BookingServiceSelection", { professionalId: member.professionalId })}
                  style={{ height: 40, flex: 1 }}
                />
                <Button
                  label={t("coaching.team.message")}
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
                  label={t("coaching.team.change")}
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
            {t("coaching.team.recommended")}
          </Text>
          {data.recommended.map((coach) => (
            <Card key={coach.id} style={{ marginBottom: spacing.sm }}>
              <Text style={{ color: colors.textPrimary }}>{coach.fullName}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                {coach.yearsExperience != null ? `${coach.yearsExperience} yrs experience` : "Experience not listed"}
              </Text>
              <Button
                label={t("coaching.team.viewProfile")}
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
