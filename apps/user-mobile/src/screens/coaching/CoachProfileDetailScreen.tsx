import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { fetchCoachProfile } from "../../api/coaching";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachProfileDetail">;

function formatPrice(cents: number) {
  return `₹${(cents / 100).toFixed(2)}`;
}

function serviceLabel(serviceType: string | null) {
  if (serviceType === "fitness") return "Fitness Coaching";
  if (serviceType === "nutrition") return "Nutrition Session";
  return "Combined Session";
}

/**
 * Coach Profile Detail (docs/coach/03-screen-inventory.md §E). Real
 * bio/specialization tags/years experience (all real `Professional`
 * fields), a real Total Clients count (active `Relationship` rows), and
 * real `ProfessionalServiceOffering` pricing. The design's 3-stat row
 * also names "Rating" — dropped, not modeled, see gap §1/coaching.service.ts.
 * "Book Session" leads to Booking: Service Selection, where the actual
 * offering/date/time gets picked — this screen's own CTA is deliberately
 * singular even though a coach may have several offerings, matching the
 * design's own single "Book Session" button.
 */
export function CoachProfileDetailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { professionalId } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "professional", professionalId],
    queryFn: () => fetchCoachProfile(professionalId),
  });

  if (isLoading) {
    return (
      <ScreenContainer title={t("coaching.profile.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title={t("coaching.profile.title")}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t("coaching.profile.title")}>
      <Card>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radius.pill,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.accent, ...typography.display }}>{data.fullName.slice(0, 1)}</Text>
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{data.fullName}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}>
              {data.verifiedServices.map((s) => (
                <Pill key={s} label={s === "fitness" ? "Fitness" : "Nutrition"} tone="accent" icon="check" />
              ))}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <StatTile icon="clock" label={t("coaching.profile.yearsExp")} value={String(data.yearsExperience ?? "—")} />
          <StatTile icon="heart" label={t("coaching.profile.clients")} value={String(data.totalClients)} />
        </View>
      </Card>

      {data.bio ? (
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.xs }}>About</Text>
          <Text style={{ color: colors.textSecondary, ...typography.body }}>{data.bio}</Text>
        </Card>
      ) : null}

      {data.specializationTags.length > 0 ? (
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Specializations</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {data.specializationTags.map((tag) => (
              <Pill key={tag} label={tag} />
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("coaching.profile.services")}</Text>
        {data.offerings.length === 0 ? (
          <Text style={{ color: colors.textSecondary }}>{t("coaching.profile.noServices")}</Text>
        ) : (
          data.offerings.map((o, i) => (
            <View
              key={o.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: spacing.sm,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textPrimary, flex: 1 }}>
                {o.label ?? serviceLabel(o.serviceType)} · {o.durationMinutes}min
              </Text>
              <Pill label={formatPrice(o.priceCents)} tone="accent" />
            </View>
          ))
        )}
      </Card>

      <Button
        label={t("coaching.team.bookSession")}
        onPress={() => navigation.navigate("BookingServiceSelection", { professionalId })}
        disabled={data.offerings.length === 0}
      />
    </ScreenContainer>
  );
}

function StatTile({ icon, label, value }: { icon: "clock" | "heart"; label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <Icon name={icon} size={18} color={colors.accent} />
      <View>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{value}</Text>
        <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
      </View>
    </View>
  );
}
