import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CoachServiceOffering, ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { LearnMoreLink } from "../../components/LearnMoreSheet";
import { DetailRow } from "../../components/GuidanceParts";
import { fetchCoachProfile, fetchRelationshipStatus } from "../../api/coaching";
import { colors, fonts, radius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { formatRupees } from "../../lib/money";
import { preferredDayForBooking } from "../../lib/coachRequest";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachProfileDetail">;

function roleLine(services: ProfessionalServiceType[]): string {
  if (services.includes("fitness") && services.includes("nutrition")) return "Fitness & Nutrition Professional";
  return services.includes("nutrition") ? "Nutrition Professional" : "Fitness Professional";
}

function offeringName(o: CoachServiceOffering): string {
  if (o.label) return o.label;
  return o.serviceType === "fitness" ? "Fitness session" : o.serviceType === "nutrition" ? "Nutrition session" : "Fitness + nutrition session";
}

/**
 * Professional profile (Figma professional/11, coach/02; redesigned 25 Oct 2026): a centred header
 * with focus tags and level, About, Services with the fee FynroX set for the coach's level, then the
 * one action that fits where the member is with this professional. No relationship yet: "Request
 * guidance" (asks first, nothing charged). Request waiting: "Request pending · View". Accepted:
 * "Continue to payment" with what they asked for already chosen. Active: "Book session". Anything
 * else open: "View status". City and languages aren't in the API, so they aren't shown.
 */
export function CoachProfileDetailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { colors: theme } = useTheme();
  const { professionalId } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "professional", professionalId],
    queryFn: () => fetchCoachProfile(professionalId),
  });
  // Where this member stands with this coach. If the status can't be read the
  // request button still works: asking again is safe (the API repeats it harmlessly).
  const status = useQuery({ queryKey: ["coaching", "relationships", "status"], queryFn: fetchRelationshipStatus });
  const mine = (status.data?.relationships ?? []).filter(
    (r) => r.professionalId === professionalId && !["declined", "expired", "completed", "ended"].includes(r.status),
  );
  // The furthest along wins (a coach can be active for one service and only requested for another).
  const FURTHEST_FIRST = ["active", "accepted", "awaiting_payment", "activating", "requested"];
  const place = (s: string) => (FURTHEST_FIRST.includes(s) ? FURTHEST_FIRST.indexOf(s) : FURTHEST_FIRST.length);
  const current = [...mine].sort((a, b) => place(a.status) - place(b.status))[0] ?? null;
  const back = () => navigation.goBack();

  if (isLoading) {
    return (
      <ScreenContainer title={t("coaching.profile.title")} onBack={back}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title={t("coaching.profile.title")} onBack={back}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const tags = [...data.specializationTags, ...(data.level ? [data.level.name] : [])];
  const nutritionOnly = data.verifiedServices.length === 1 && data.verifiedServices[0] === "nutrition";

  return (
    <ScreenContainer title={t("coaching.profile.title")} onBack={back}>
      {/* Header */}
      <Section style={{ alignItems: "center", paddingVertical: spacing.lg }}>
        <Avatar name={data.fullName} size={84} />
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22, marginTop: spacing.sm, textAlign: "center" }}>
          {data.fullName}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{roleLine(data.verifiedServices)}</Text>
        {tags.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: spacing.sm }}>
            {tags.map((tag) => (
              <View key={tag} style={{ borderRadius: radius.pill, backgroundColor: theme.accentSoft, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 12 }}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      {/* About */}
      <Section>
        <SectionTitle>About</SectionTitle>
        {data.bio ? <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{data.bio}</Text> : null}
        <DetailRow label={t("coaching.profile.yearsExp")} value={data.yearsExperience != null ? `${data.yearsExperience} years` : "—"} />
        <DetailRow label={t("coaching.profile.clients")} value={String(data.totalClients)} />
      </Section>

      {/* Services */}
      <Section>
        <SectionTitle>{t("coaching.profile.services")}</SectionTitle>
        {data.offerings.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t("coaching.profile.noServices")}</Text>
        ) : (
          data.offerings.map((o) => (
            <View key={o.id} style={{ backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: spacing.md, gap: 4 }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{offeringName(o)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{`${o.durationMinutes} min session`}</Text>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 17 }}>
                {o.priceCents === 0 ? "Free" : `${formatRupees(o.priceCents)} + GST · Fee set by FynroX for this coach's level`}
              </Text>
            </View>
          ))
        )}
      </Section>

      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
        <Icon name="info" size={16} color={colors.textMuted} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
            {nutritionOnly
              ? "Nutrition guidance, not medical treatment. Nothing is charged until they accept and you pay."
              : "Nothing is charged until they accept and you pay."}
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <LearnMoreLink topic="coach_requests" />
          </View>
        </View>
      </View>

      {current === null ? (
        <Button
          label={t("coaching.profile.requestGuidance")}
          onPress={() => navigation.navigate("RequestCoach", { professionalId })}
          disabled={data.offerings.length === 0 || status.isLoading}
        />
      ) : current.status === "active" ? (
        <Button
          label={t("coaching.team.bookSession")}
          onPress={() => navigation.navigate("BookingServiceSelection", { professionalId })}
          disabled={data.offerings.length === 0}
        />
      ) : current.status === "accepted" || current.status === "awaiting_payment" ? (
        <Button
          label={t("coaching.relationship.continueToPayment")}
          onPress={() =>
            navigation.navigate("BookingServiceSelection", {
              professionalId,
              offeringId: current.offeringId ?? undefined,
              preferredDate: preferredDayForBooking(current.preferredDate) ?? undefined,
            })
          }
        />
      ) : (
        <Button
          label={current.status === "requested" ? t("coaching.profile.requestPending") : t("coaching.profile.viewStatus")}
          onPress={() =>
            current.status === "requested" || current.status === "activation_failed" || current.stuck
              ? navigation.navigate("RequestStatus", { relationshipId: current.relationshipId })
              : navigation.navigate("ProfessionalRelationship")
          }
        />
      )}
      <Button
        label="Compare professionals"
        variant="secondary"
        onPress={() => navigation.navigate("CoachDiscovery", { serviceType: data.verifiedServices.length === 1 ? data.verifiedServices[0] : undefined })}
      />
    </ScreenContainer>
  );
}

function Section({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }, style]}>
      {children}
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{children}</Text>;
}
