import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CoachDiscoveryItem, ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { LearnMoreLink } from "../../components/LearnMoreSheet";
import { discoverCoaches } from "../../api/coaching";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { formatRupees } from "../../lib/money";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachDiscovery">;

type ServiceFilter = ProfessionalServiceType | "combined" | "all";

const SERVICE_CHIPS: Array<{ value: ServiceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "fitness", label: "Fitness" },
  { value: "nutrition", label: "Nutrition" },
  { value: "combined", label: "Fitness + Nutrition" },
];

/**
 * Professional Guidance: find a professional (Figma coach/01; redesigned 25 Oct 2026). Search, a
 * service filter, then one card per verified professional with their level, what they focus on, the
 * lowest fee for their level, and View Profile / Request Guidance.
 *
 * Not copied from the Figma: the "Trainers at Elevation Fitness" section and "your professional" tag
 * (gym partners are switched off), the 24-hour gym-first rule, a Yoga filter (not a service type) and
 * photos (the API has none). Kept from earlier owner decisions: male / female and sort chips, and
 * "Ask us to match you".
 */
export function CoachDiscoveryScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>(route.params?.serviceType ?? "all");
  const [sort, setSort] = useState<"experience" | "price">("experience");
  // Owner, 24 Oct 2026: browse male or female coaches (as "Ask for a coach" already allows).
  const [gender, setGender] = useState<"any" | "male" | "female">("any");

  // A caller can open this again with a new pre-filter while the screen is still mounted (Change
  // Professional's "Find new coach"); re-sync then, without overriding the member's own choice otherwise.
  useEffect(() => {
    if (route.params?.serviceType) {
      setServiceFilter(route.params.serviceType);
    }
  }, [route.params?.serviceType]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "professionals", serviceFilter, sort, search, gender],
    queryFn: () =>
      discoverCoaches({
        serviceType: serviceFilter === "all" ? undefined : serviceFilter,
        search: search.trim() || undefined,
        sort,
        gender: gender === "any" ? undefined : gender,
      }),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <ScreenContainer title="Professional Guidance" onBack={() => navigation.goBack()}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          Verified professionals. FynroX sets each coach's fee by their coach level, so fees can differ. You pay only after they accept.
        </Text>
        <View style={{ alignSelf: "flex-start" }}>
          <LearnMoreLink topic="coach_requests" />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder={t("coaching.discovery.search")} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
        {SERVICE_CHIPS.map(({ value, label }) => (
          <Chip key={value} label={label} selected={serviceFilter === value} onPress={() => setServiceFilter(value)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
        <Chip label="Any" variant="outlined" selected={gender === "any"} onPress={() => setGender("any")} />
        <Chip label="Male" variant="outlined" selected={gender === "male"} onPress={() => setGender("male")} />
        <Chip label="Female" variant="outlined" selected={gender === "female"} onPress={() => setGender("female")} />
        <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
        <Chip label={t("coaching.discovery.mostExperienced")} variant="outlined" selected={sort === "experience"} onPress={() => setSort("experience")} />
        <Chip label={t("coaching.discovery.lowestPrice")} variant="outlined" selected={sort === "price"} onPress={() => setSort("price")} />
      </ScrollView>

      {isLoading ? (
        <Card>
          <Text style={{ color: colors.textSecondary }}>{t("coaching.discovery.loading")}</Text>
        </Card>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title={t("coaching.discovery.emptyTitle")} subtitle={t("coaching.discovery.emptySubtitle")} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.7 }}>
            {`ONLINE PROFESSIONALS · ${items.length}`}
          </Text>
          {items.map((coach) => (
            <ProfessionalCard
              key={coach.id}
              coach={coach}
              onProfile={() => navigation.navigate("CoachProfileDetail", { professionalId: coach.id })}
              onRequest={coach.startingPriceCents != null ? () => navigation.navigate("RequestCoach", { professionalId: coach.id }) : undefined}
            />
          ))}
        </View>
      )}

      <Pressable
        onPress={() => navigation.navigate("RequestGuidance")}
        accessibilityRole="button"
        accessibilityLabel="Not sure who to pick? Ask us to match you with a professional"
        style={({ pressed }) => ({
          padding: spacing.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceHigh : colors.surfaceRaised,
          gap: 2,
        })}
      >
        <Text style={{ color: colors.textPrimary, ...typography.label }}>Not sure who to pick?</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>Ask us to match you. You can choose a male or female professional.</Text>
      </Pressable>
      <Button label={t("coaching.discovery.findTeam")} variant="secondary" size="compact" onPress={() => navigation.navigate("MyProfessionalTeam")} />
    </ScreenContainer>
  );
}

/** One professional (Figma coach/01 card): avatar, name and level, focus and lowest fee, two text actions. */
function ProfessionalCard({ coach, onProfile, onRequest }: { coach: CoachDiscoveryItem; onProfile: () => void; onRequest?: () => void }) {
  const { colors: theme } = useTheme();
  const focus = coach.specializationTags[0] ?? coach.verifiedServices.map((s) => (s === "fitness" ? "Fitness" : "Nutrition")).join(" & ");
  const fee = coach.startingPriceCents == null ? "Not bookable yet" : `from ${formatRupees(coach.startingPriceCents)} + GST`;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
      }}
    >
      <Avatar name={coach.fullName} size={64} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 16 }} numberOfLines={1}>
            {coach.fullName}
          </Text>
          {coach.level ? (
            <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.4 }}>{coach.level.name.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
          {[focus, coach.yearsExperience != null ? `${coach.yearsExperience} yrs` : null, fee].filter(Boolean).join(" · ")}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: 2 }}>
          <Pressable onPress={onProfile} accessibilityRole="button" accessibilityLabel={`View ${coach.fullName}'s profile`} hitSlop={10}>
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>View Profile</Text>
          </Pressable>
          {onRequest ? (
            <Pressable onPress={onRequest} accessibilityRole="button" accessibilityLabel={`Request guidance from ${coach.fullName}`} hitSlop={10}>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Request Guidance</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
