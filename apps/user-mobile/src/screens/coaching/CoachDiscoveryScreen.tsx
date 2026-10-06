import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Avatar } from "../../components/Avatar";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { SearchBar } from "../../components/SearchBar";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { discoverCoaches } from "../../api/coaching";
import { professionalRoleLabel } from "../../lib/quoteFormat";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachDiscovery">;

type ServiceFilter = ProfessionalServiceType | "combined" | "all";

// Figma shows All / Fitness / Nutrition / Yoga. There is no yoga category
// anywhere in this product, so that chip is omitted; "Both" covers coaches
// verified for fitness and nutrition.
const SERVICE_CHIPS: Array<{ value: ServiceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "fitness", label: "Fitness" },
  { value: "nutrition", label: "Nutrition" },
  { value: "combined", label: "Combined" },
];

/**
 * Professional Guidance discovery (Figma 01): search, service chips and a list
 * of verified professionals, each with View Profile / Request Guidance.
 * Re-syncs the filter when a caller (Change Professional) passes a new
 * serviceType, because React Navigation reuses this screen instance.
 */
export function CoachDiscoveryScreen({ navigation, route }: Props) {
  const { colors: theme } = useTheme();
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>(route.params?.serviceType ?? "all");

  useEffect(() => {
    if (route.params?.serviceType) {
      setServiceFilter(route.params.serviceType);
    }
  }, [route.params?.serviceType]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "professionals", serviceFilter, search],
    queryFn: () =>
      discoverCoaches({
        serviceType: serviceFilter === "all" ? undefined : serviceFilter,
        search: search.trim() || undefined,
        sort: "experience",
      }),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <ScreenContainer
      title="Professional Guidance"
      subtitle="Request additional guidance within an agreed service scope"
      right={
        <Pressable
          onPress={() => navigation.navigate("MyProfessionalTeam")}
          accessibilityRole="button"
          accessibilityLabel="My professionals"
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="users" size={18} color={colors.textSecondary} />
        </Pressable>
      }
    >
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search professionals, specialties…" />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {SERVICE_CHIPS.map(({ value, label }) => (
          <Chip key={value} label={label} selected={serviceFilter === value} onPress={() => setServiceFilter(value)} />
        ))}
      </View>

      {isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={92} />
          <Skeleton height={92} />
        </View>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState title="No verified professionals found" subtitle="Check back soon, or try a different search or filter." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((coach) => (
            <View
              key={coach.id}
              style={{
                flexDirection: "row",
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radius.card,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Avatar name={coach.fullName} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{coach.fullName}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  {professionalRoleLabel(coach.verifiedServices)}
                  {coach.yearsExperience != null ? ` · ${coach.yearsExperience} yrs` : ""}
                </Text>
                {coach.specializationTags.length > 0 ? (
                  <Text style={{ color: colors.textSecondary, ...typography.meta }} numberOfLines={1}>
                    {coach.specializationTags.join(" · ")}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.xs }}>
                  <Text
                    onPress={() => navigation.navigate("CoachProfileDetail", { professionalId: coach.id })}
                    accessibilityRole="link"
                    style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 13 }}
                  >
                    View Profile
                  </Text>
                  <Text
                    onPress={() => navigation.navigate("RequestQuote", { professionalId: coach.id, professionalName: coach.fullName })}
                    accessibilityRole="link"
                    style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 13 }}
                  >
                    Request Guidance
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
