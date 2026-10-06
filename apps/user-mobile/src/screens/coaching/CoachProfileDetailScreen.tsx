import React from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Avatar } from "../../components/Avatar";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { BodyText, SummaryCard } from "../../components/GuidanceParts";
import { fetchCoachProfile } from "../../api/coaching";
import { firstName, professionalRoleLabel } from "../../lib/quoteFormat";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachProfileDetail">;

function serviceLabel(serviceType: string | null) {
  if (serviceType === "fitness") return "Fitness Coaching";
  if (serviceType === "nutrition") return "Nutrition Session";
  return "Combined Session";
}

/**
 * Professional Profile (Figma 10): avatar, role, tags, About, Services and
 * Request guidance / Compare professionals. Real fields only: bio, tags, years
 * of experience, active-client count and priced offerings. City, languages and
 * a profile photo have no backing in this build, so they are not shown. Service
 * fees are quoted per request; "Book a session directly" keeps the existing
 * list-price booking flow available.
 */
export function CoachProfileDetailScreen({ navigation, route }: Props) {
  const { professionalId } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "professional", professionalId],
    queryFn: () => fetchCoachProfile(professionalId),
  });

  if (isLoading) {
    return (
      <ScreenContainer title="Professional Profile">
        <BackButton onPress={() => navigation.goBack()} />
        <Skeleton height={200} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer title="Professional Profile">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const first = firstName(data.fullName);

  return (
    <ScreenContainer title="Professional Profile">
      <BackButton onPress={() => navigation.goBack()} />
      <View
        style={{
          alignItems: "center",
          gap: spacing.xs,
          padding: spacing.md,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Avatar name={data.fullName} size={64} />
        <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>{data.fullName}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{professionalRoleLabel(data.verifiedServices)}</Text>
        {data.specializationTags.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, justifyContent: "center", marginTop: spacing.xs }}>
            {data.specializationTags.map((tag) => (
              <Pill key={tag} label={tag} tone="accent" />
            ))}
          </View>
        ) : null}
      </View>

      <SummaryCard
        title="About"
        rows={[
          ...(data.yearsExperience != null ? ([["Experience", `${data.yearsExperience} years`]] as Array<[string, string]>) : []),
          ["Active clients", String(data.totalClients)],
        ]}
      >
        <BodyText>{data.bio ?? `${first} hasn't added a bio yet.`}</BodyText>
      </SummaryCard>

      <SummaryCard title="Services">
        {data.offerings.length === 0 ? (
          <BodyText>No services listed yet. Send a request and {first} will confirm scope and fee.</BodyText>
        ) : (
          data.offerings.map((o) => (
            <View key={o.id} style={{ backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, padding: spacing.sm, gap: 2 }}>
              <Text style={{ color: colors.textPrimary, ...typography.label }}>{o.label ?? serviceLabel(o.serviceType)}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>{o.durationMinutes} min session</Text>
              <Text style={{ color: colors.accent, ...typography.meta }}>Fee quoted after {first} accepts</Text>
            </View>
          ))
        )}
      </SummaryCard>

      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
        <Icon name="info" size={15} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, ...typography.meta, flex: 1 }}>
          Guidance only. Not medical treatment. You choose what to request, and the professional confirms scope and fee before you pay.
        </Text>
      </View>

      <Button label="Request guidance" onPress={() => navigation.navigate("RequestQuote", { professionalId, professionalName: data.fullName })} />
      <Button label="Compare professionals" variant="secondary" onPress={() => navigation.navigate("CoachDiscovery", undefined)} />
      {data.offerings.length > 0 ? (
        <Text
          onPress={() => navigation.navigate("BookingServiceSelection", { professionalId })}
          accessibilityRole="link"
          style={{ color: colors.accent, ...typography.label, textAlign: "center" }}
        >
          Or book a session directly at list price
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
