import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { discoverCoaches } from "../../api/coaching";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachDiscovery">;

type ServiceFilter = ProfessionalServiceType | "combined" | "all";

const SERVICE_CHIPS: Array<{ value: ServiceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "fitness", label: "Fitness Coach" },
  { value: "nutrition", label: "Nutrition Professional" },
  { value: "combined", label: "Fitness + Nutrition" },
];

function formatPrice(cents: number | null) {
  if (cents == null) return "Price varies";
  return `From ₹${(cents / 100).toFixed(2)}`;
}

/**
 * Discovery Filters + Discovery List, combined into one screen
 * (docs/coach/03-screen-inventory.md §E — two of the seven §E screens).
 * Same "combine near-duplicate design screens into one real one"
 * precedent already used for Security (folds in Data & Privacy) and
 * Subscription (folds in Subscription Plans + Management) — a search bar
 * plus filter/sort chips over a live list works better as one screen on
 * mobile than a separate "apply filters" step before seeing any results.
 *
 * The design's "Rating/Price/Availability" sort pills are narrowed to
 * Price/Experience — no rating/review system exists anywhere in this
 * build, and a fixed slot grid (see BookingServiceSelectionScreen) has no
 * meaningful cross-coach "soonest available" ranking. Coach-type chips
 * use v1-coach's Fitness Coach / Nutrition Professional / Fitness +
 * Nutrition taxonomy, not the original consumer-app design's Yoga/Sports
 * categories — nothing else in this product supports those, see gap §1.
 */
export function CoachDiscoveryScreen({ navigation, route }: Props) {
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>(route.params?.serviceType ?? "all");
  const [sort, setSort] = useState<"experience" | "price">("experience");

  // Found via a live Playwright walkthrough, not just typecheck/lint: when
  // Change Professional's "Find New [Service] Coach" navigates back here
  // with a pre-filter, React Navigation reuses this screen's EXISTING
  // stack instance (it was already pushed once from the More menu) rather
  // than remounting it — so route.params updates, but the `useState`
  // initializer above never re-runs, and the filter chip silently stayed
  // on "All". Re-syncing on every change to route.params.serviceType fixes
  // that without disturbing a user's own manual filter choice otherwise
  // (this only fires when a caller actually passes a new serviceType).
  useEffect(() => {
    if (route.params?.serviceType) {
      setServiceFilter(route.params.serviceType);
    }
  }, [route.params?.serviceType]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "professionals", serviceFilter, sort, search],
    queryFn: () =>
      discoverCoaches({
        serviceType: serviceFilter === "all" ? undefined : serviceFilter,
        search: search.trim() || undefined,
        sort,
      }),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <ScreenContainer title="Coaching">
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search coaches" />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
        {SERVICE_CHIPS.map(({ value, label }) => (
          <Chip key={value} label={label} selected={serviceFilter === value} onPress={() => setServiceFilter(value)} />
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm }}>
        <Chip label="Most experienced" selected={sort === "experience"} onPress={() => setSort("experience")} />
        <Chip label="Lowest price" selected={sort === "price"} onPress={() => setSort("price")} />
      </View>

      <Button
        label="Find My Professional Team"
        variant="secondary"
        onPress={() => navigation.navigate("MyProfessionalTeam")}
        style={{ marginTop: spacing.md, height: 40 }}
      />

      {isLoading ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textSecondary }}>Loading coaches…</Text>
        </Card>
      ) : isError ? (
        <ErrorState style={{ marginTop: spacing.md }} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          style={{ marginTop: spacing.md }}
          title="No verified coaches yet"
          subtitle="Check back soon, or try a different filter."
        />
      ) : (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            Showing {items.length} verified coach{items.length === 1 ? "" : "es"}
          </Text>
          {items.map((coach) => (
            <Card key={coach.id}>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.accent, ...typography.h1 }}>{coach.fullName.slice(0, 1)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{coach.fullName}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}>
                    {coach.verifiedServices.map((s) => (
                      <Pill key={s} label={s === "fitness" ? "Fitness" : "Nutrition"} tone="accent" icon="check" />
                    ))}
                  </View>
                  <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                    {coach.yearsExperience != null ? `${coach.yearsExperience} yrs` : "Experience n/a"}
                    {" · "}
                    {formatPrice(coach.startingPriceCents)}
                  </Text>
                </View>
              </View>
              {coach.specializationTags.length > 0 ? (
                <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.sm }}>
                  {coach.specializationTags.join(" · ")}
                </Text>
              ) : null}
              <Button
                label="View Profile"
                variant="secondary"
                onPress={() => navigation.navigate("CoachProfileDetail", { professionalId: coach.id })}
                style={{ marginTop: spacing.md, height: 42 }}
              />
            </Card>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
