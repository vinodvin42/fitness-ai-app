import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { SearchBar } from "../../components/SearchBar";
import { ListRow } from "../../components/ListRow";
import { EmptyState } from "../../components/EmptyState";
import { fetchExercises, fetchPrograms, fetchRecipes } from "../../api/programs";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = NativeStackScreenProps<TodayStackParamList, "Search">;

const MAX_PER_GROUP = 6;

function matches(query: string, ...fields: Array<string | undefined>): boolean {
  const q = query.trim().toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

/**
 * Today 03 — Search. Client-side over catalogs the app already fetches
 * (programs, exercises, recipes); there is no user-facing search endpoint.
 * The Figma's recent-searches / trending sections are not built: they need
 * persisted history and server-side popularity, neither of which exists.
 */
export function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const programs = useQuery({ queryKey: ["programs"], queryFn: fetchPrograms });
  const exercises = useQuery({ queryKey: ["exercises"], queryFn: fetchExercises });
  const recipes = useQuery({ queryKey: ["recipes"], queryFn: fetchRecipes });

  const q = query.trim();
  const results = useMemo(() => {
    if (q.length < 2) return null;
    return {
      programs: (programs.data ?? []).filter((p) => matches(q, p.name, p.description)).slice(0, MAX_PER_GROUP),
      exercises: (exercises.data ?? [])
        .filter((e) => matches(q, e.name, e.muscleGroup, e.equipment))
        .slice(0, MAX_PER_GROUP),
      recipes: (recipes.data ?? []).filter((r) => matches(q, r.name, ...r.tags)).slice(0, MAX_PER_GROUP),
    };
  }, [q, programs.data, exercises.data, recipes.data]);

  const total = results ? results.programs.length + results.exercises.length + results.recipes.length : 0;
  const parent = navigation.getParent();

  return (
    <ScreenContainer title="Search">
      <BackButton onPress={() => navigation.goBack()} />
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search programs, exercises, recipes" />

      {!results ? (
        <Text style={{ color: colors.textMuted, ...typography.meta }}>Type at least 2 characters to search.</Text>
      ) : total === 0 ? (
        <EmptyState title="No results" subtitle={`Nothing matched "${q}".`} />
      ) : (
        <View style={{ gap: spacing.md }}>
          {results.programs.length > 0 && (
            <Group title="Programs">
              {results.programs.map((p) => (
                <ListRow
                  key={p.id}
                  icon="trophy"
                  imageUrl={p.imageUrl}
                  title={p.name}
                  subtitle={`${p.durationWeeks} weeks`}
                  onPress={() => parent?.navigate("Train", { screen: "ProgramDetail", params: { programId: p.id } })}
                />
              ))}
            </Group>
          )}
          {results.exercises.length > 0 && (
            <Group title="Exercises">
              {results.exercises.map((e) => (
                <ListRow
                  key={e.id}
                  icon="dumbbell"
                  imageUrl={e.mediaUrl}
                  title={e.name}
                  subtitle={`${e.muscleGroup} · ${e.equipment}`}
                  onPress={() => parent?.navigate("Train", { screen: "ExerciseDetail", params: { exerciseId: e.id } })}
                />
              ))}
            </Group>
          )}
          {results.recipes.length > 0 && (
            <Group title="Recipes">
              {results.recipes.map((r) => (
                <ListRow
                  key={r.id}
                  icon="utensils"
                  imageUrl={r.imageUrl}
                  title={r.name}
                  subtitle={`${r.calories} kcal · ${r.prepTimeMinutes} min`}
                  onPress={() => parent?.navigate("Fuel", { screen: "RecipeDetail", params: { recipeId: r.id } })}
                />
              ))}
            </Group>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.textMuted, ...typography.label }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}
