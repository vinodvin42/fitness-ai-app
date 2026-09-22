import React from "react";
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { Program } from "@fitness-ai-app/types";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchPrograms } from "../../api/programs";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "TrainDashboard">;

/**
 * Train Dashboard (trn-01) — docs/mobile/03-screen-inventory.md §C. 31 Aug
 * 2026 design polish: iconized entry-point rows (ListRow) and richer program
 * cards. Data/navigation wiring (Programs list → Program Detail, My Programs,
 * Exercise Library, Workout History) is unchanged from the functional build.
 *
 * 4 Sep 2026: a program card now leads with the program's own cover photo
 * (`Program.imageUrl`) instead of a generic dumbbell tile. The tile is
 * still the fallback — `imageUrl` is nullable and an admin-authored
 * program may not have one — so the card layout is identical either way.
 *
 * 22 Sep 2026: added a "Browse All Programs" entry to ProgramsMarketplace
 * (trn-02) — this screen's own inline Programs list below stays as a short,
 * unfiltered preview; the marketplace screen is the real searchable/
 * filterable catalog.
 */
export function TrainScreen({ navigation }: Props) {
  const programsQuery = useQuery({ queryKey: ["programs"], queryFn: fetchPrograms });

  return (
    <ScreenContainer title="Train" scroll={false}>
      <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
        <ListRow
          icon="search"
          title="Browse All Programs"
          subtitle="Search & filter the full catalog"
          tint={colors.accent}
          tintSoft={colors.accentSoft}
          onPress={() => navigation.navigate("ProgramsMarketplace")}
        />
        <ListRow
          icon="target"
          title="My Programs"
          subtitle="Purchased & started plans"
          onPress={() => navigation.navigate("MyPrograms")}
        />
        <ListRow
          icon="dumbbell"
          title="Exercise Library"
          subtitle="Browse by muscle & equipment"
          tint={colors.success}
          tintSoft={colors.successSoft}
          onPress={() => navigation.navigate("ExerciseLibrary")}
        />
        <ListRow
          icon="line-chart"
          title="Workout History"
          subtitle="Past sessions & PRs"
          tint={colors.aiAccent}
          tintSoft={colors.aiAccentSoft}
          onPress={() => navigation.navigate("WorkoutHistory")}
        />
      </View>

      <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Programs</Text>
      {programsQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : programsQuery.isError ? (
        <ErrorState onRetry={() => programsQuery.refetch()} />
      ) : (
        <FlatList
          data={programsQuery.data ?? []}
          keyExtractor={(item: Program) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate("ProgramDetail", { programId: item.id })}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius.md,
                      backgroundColor: colors.accentSoft,
                    }}
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
          ListEmptyComponent={<EmptyState title="No programs yet" />}
        />
      )}
    </ScreenContainer>
  );
}
