import React, { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Exercise } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Chip } from "../../components/Chip";
import { ListRow } from "../../components/ListRow";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchExercises } from "../../api/programs";
import { colors, spacing, typography } from "../../theme/tokens";
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

  return (
    <ScreenContainer title="Exercise Library" scroll={false}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search exercises" />

      <Text style={{ color: colors.textMuted, ...typography.caption, marginTop: spacing.md }}>MUSCLE GROUP</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}>
        {muscleGroups.map((mg) => (
          <Chip key={mg} label={mg} selected={muscleGroup === mg} onPress={() => setMuscleGroup(mg)} />
        ))}
      </View>

      <Text style={{ color: colors.textMuted, ...typography.caption, marginTop: spacing.md }}>EQUIPMENT</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}>
        {equipmentOptions.map((eq) => (
          <Chip key={eq} label={eq} selected={equipment === eq} onPress={() => setEquipment(eq)} />
        ))}
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
          <ListRow
            icon="dumbbell"
            imageUrl={item.mediaUrl}
            title={item.name}
            subtitle={`${item.muscleGroup} · ${item.equipment} · ${item.difficulty}`}
            onPress={() => navigation.navigate("ExerciseDetail", { exerciseId: item.id })}
          />
        )}
        ListEmptyComponent={<EmptyState title="No exercises match" subtitle="Try a different search or filter." />}
      />
    </ScreenContainer>
  );
}
