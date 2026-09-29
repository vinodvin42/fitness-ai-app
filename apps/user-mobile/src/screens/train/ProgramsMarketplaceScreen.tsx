import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Program, ProgramType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { Chip } from "../../components/Chip";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchPrograms } from "../../api/programs";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ProgramsMarketplace">;

const ALL_TYPE = "All";
const PRICE_ALL = "All";
const PRICE_FREE = "Free";
const PRICE_PAID = "Paid";

const TYPE_LABELS: Record<ProgramType, string> = {
  fitness: "Fitness",
  nutrition: "Nutrition",
  combined: "Combined",
};

/**
 * Programs Marketplace (trn-02) — docs/mobile/03-screen-inventory.md §C.
 * Added 22 Sep 2026 to close the gap flagged in TrainStack's own doc comment:
 * before this screen, the only way to see a Program was via Train
 * Dashboard's own inline list (unfiltered, unsearchable) or a Plan
 * recommendation — there was no dedicated "browse the full catalog" screen.
 * Reuses the same `GET /programs` the Train Dashboard already calls (no new
 * endpoint — the existing one already returns every published Program) and
 * filters client-side, mirroring ExerciseLibraryScreen's own search/filter
 * pattern. Filters by `Program.type` and free/paid (`priceCents`) — the
 * real schema fields. `Difficulty` is intentionally not a filter here: it's
 * an `Exercise`/`Workout` field, not a `Program` field, so there's nothing
 * real to filter by at the program level. Tapping a card pushes the
 * existing Program Detail screen — this screen does no purchase/entitlement
 * work of its own.
 */
export function ProgramsMarketplaceScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { data: programs, isLoading, isError, refetch } = useQuery({
    queryKey: ["programs"],
    queryFn: fetchPrograms,
  });

  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>(ALL_TYPE);
  const [price, setPrice] = useState<string>(PRICE_ALL);

  const typeOptions = useMemo(() => {
    const set = new Set((programs ?? []).map((p) => p.type));
    return [ALL_TYPE, ...Array.from(set).sort()];
  }, [programs]);

  const filtered = useMemo(() => {
    return (programs ?? []).filter((p) => {
      const matchesQuery = p.name.toLowerCase().includes(query.trim().toLowerCase());
      const matchesType = type === ALL_TYPE || p.type === type;
      const matchesPrice =
        price === PRICE_ALL || (price === PRICE_FREE ? p.priceCents === 0 : p.priceCents > 0);
      return matchesQuery && matchesType && matchesPrice;
    });
  }, [programs, query, type, price]);

  if (isError) {
    return (
      <ScreenContainer title={t("workout.marketplace.title")}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t("workout.marketplace.title")} scroll={false}>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t("workout.marketplace.search")} />

      <Text style={{ color: colors.textMuted, ...typography.caption, marginTop: spacing.md }}>TYPE</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}>
        {typeOptions.map((t) => (
          <Chip
            key={t}
            label={t === ALL_TYPE ? ALL_TYPE : TYPE_LABELS[t as ProgramType] ?? t}
            selected={type === t}
            onPress={() => setType(t)}
          />
        ))}
      </View>

      <Text style={{ color: colors.textMuted, ...typography.caption, marginTop: spacing.md }}>PRICE</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}>
        {[PRICE_ALL, PRICE_FREE, PRICE_PAID].map((p) => (
          <Chip key={p} label={p} selected={price === p} onPress={() => setPrice(p)} />
        ))}
      </View>

      <FlatList
        style={{ marginTop: spacing.md }}
        data={filtered}
        keyExtractor={(item: Program) => item.id}
        refreshing={isLoading}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("ProgramDetail", { programId: item.id })}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.accentSoft }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: radius.md,
                    backgroundColor: colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="dumbbell" size={22} color={colors.accent} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{item.name}</Text>
                <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
                  {item.durationWeeks}-week {item.type} program
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 4,
                  borderRadius: radius.pill,
                  backgroundColor: item.priceCents === 0 ? colors.successSoft : colors.accentSoft,
                }}
              >
                <Text
                  style={{
                    color: item.priceCents === 0 ? colors.success : colors.accent,
                    ...typography.caption,
                    fontFamily: fonts.bodyBold,
                  }}
                >
                  {item.priceCents === 0 ? "FREE" : `₹${(item.priceCents / 100).toFixed(0)}`}
                </Text>
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title={t("workout.marketplace.emptyTitle")} subtitle={t("workout.marketplace.emptySubtitle")} />}
      />
    </ScreenContainer>
  );
}
