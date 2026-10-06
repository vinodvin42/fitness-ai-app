import React, { useMemo, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Exercise } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Chip } from "../../components/Chip";
import { BackButton } from "../../components/BackButton";
import { Icon } from "../../components/Icon";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchExercises } from "../../api/programs";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ExerciseLibrary">;

const ALL = "All";

/**
 * Exercise Library (trn-05) — docs/mobile/03-screen-inventory.md §C:
 * "search + filters (body part, equipment) over a list of exercises."
 * Shipped 19 Aug 2026, pulled out of Train Dashboard's own inline exercise
 * list into its own real screen — muscle-group/equipment filter chips are
 * generated from whatever this build's exercises actually have (no fixed
 * enum exists for either), so the filter options grow automatically as
 * more exercises get seeded/authored. Leads into Exercise Detail (trn-06).
 *
 * 4 Sep 2026: rows show the exercise's demonstration photo
 * (`Exercise.mediaUrl`, populated for the first time in the same pass),
 * falling back to the dumbbell icon tile for exercises without one.
 */
export function ExerciseLibraryScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const { data: exercises, isLoading, isError, refetch } = useQuery({
    queryKey: ["exercises"],
    queryFn: fetchExercises,
  });

  const [query, setQuery] = useState("");
  const [muscleGroup, setMuscleGroup] = useState(ALL);
  const [equipment, setEquipment] = useState(ALL);

  const muscleGroups = useMemo(() => {
    const set = new Set((exercises ?? []).map((e) => e.muscleGroup));
    return [ALL, ...Array.from(set).sort()];
  }, [exercises]);

  const equipmentOptions = useMemo(() => {
    const set = new Set((exercises ?? []).map((e) => e.equipment));
    return [ALL, ...Array.from(set).sort()];
  }, [exercises]);

  const filtered = useMemo(() => {
    return (exercises ?? []).filter((e) => {
      const matchesQuery = e.name.toLowerCase().includes(query.trim().toLowerCase());
      const matchesMuscle = muscleGroup === ALL || e.muscleGroup === muscleGroup;
      const matchesEquipment = equipment === ALL || e.equipment === equipment;
      return matchesQuery && matchesMuscle && matchesEquipment;
    });
  }, [exercises, query, muscleGroup, equipment]);

  if (isError) {
    return (
      <ScreenContainer title="Exercise Library">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  const DIFFICULTY_COLOR = { beginner: colors.success, intermediate: theme.accent, advanced: colors.orange } as const;

  return (
    <ScreenContainer title="Exercise Library" scroll={false}>
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ marginTop: spacing.sm }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search exercises..." />
      </View>

      <View style={{ marginHorizontal: -spacing.md, marginTop: spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md }}>
          {muscleGroups.map((mg) => (
            <Chip key={mg} label={mg} selected={muscleGroup === mg} onPress={() => setMuscleGroup(mg)} />
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md, marginTop: 8 }}
        >
          {equipmentOptions.map((eq) => (
            <Chip key={eq} label={eq} variant="outlined" selected={equipment === eq} onPress={() => setEquipment(eq)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        style={{ marginTop: spacing.md }}
        data={filtered}
        keyExtractor={(item: Exercise) => item.id}
        refreshing={isLoading}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("ExerciseDetail", { exerciseId: item.id })}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.muscleGroup}, ${item.equipment}, ${item.difficulty}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.sm + 2,
            }}
          >
            {item.mediaUrl ? (
              <Image source={{ uri: item.mediaUrl }} style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.surfaceRaised }} resizeMode="cover" />
            ) : (
              <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                <Icon name="dumbbell" size={20} color={colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 15 }} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.muscleGroup}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.equipment}</Text>
                <View style={{ borderRadius: 5, borderWidth: 1, borderColor: DIFFICULTY_COLOR[item.difficulty], paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ color: DIFFICULTY_COLOR[item.difficulty], fontSize: 10, fontFamily: fonts.bodySemi, textTransform: "capitalize" }}>
                    {item.difficulty}
                  </Text>
                </View>
              </View>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="No exercises match" subtitle="Try a different search or filter." />}
        ListFooterComponent={
          filtered.length > 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.sm }}>
              Showing {filtered.length} of {exercises?.length ?? 0} exercises
            </Text>
          ) : null
        }
      />
    </ScreenContainer>
  );
}
