import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ImageBackground, Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { SearchBar } from "../../components/SearchBar";
import { ListRow } from "../../components/ListRow";
import { EmptyState } from "../../components/EmptyState";
import { Icon, IconName } from "../../components/Icon";
import { fetchExercises, fetchPrograms, fetchRecipes, fetchTrendingWorkout } from "../../api/programs";
import { discoverCoaches } from "../../api/coaching";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = NativeStackScreenProps<TodayStackParamList, "Search">;

const MAX_PER_GROUP = 6;
const RECENT_KEY = "search.recent";
const MAX_RECENT = 8;

function matches(query: string, ...fields: Array<string | undefined>): boolean {
  const q = query.trim().toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Today 03 - Search (Figma frame 03). Idle state: pill search field with a
 * (visual-only) mic, "Recent Searches" chips persisted in AsyncStorage,
 * "Explore Categories" rows with REAL catalog counts, and a "Trending
 * Workouts" hero from GET /workouts/trending (most-started workout in the
 * last 30 days, else the first published program workout). Typing switches to
 * results, searched client-side over the catalogs the app already fetches
 * plus the coach directory's own search.
 */
export function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const programs = useQuery({ queryKey: ["programs"], queryFn: fetchPrograms });
  const exercises = useQuery({ queryKey: ["exercises"], queryFn: fetchExercises });
  const recipes = useQuery({ queryKey: ["recipes"], queryFn: fetchRecipes });
  const trending = useQuery({ queryKey: ["trending", "workout"], queryFn: fetchTrendingWorkout, staleTime: 5 * 60_000 });

  const q = query.trim();
  const pros = useQuery({
    queryKey: ["search", "professionals", q.toLowerCase()],
    queryFn: () => discoverCoaches({ search: q }),
    enabled: q.length >= 2,
    retry: false,
  });

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => {
        const parsed = v ? (JSON.parse(v) as unknown) : [];
        if (Array.isArray(parsed)) setRecent(parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT));
      })
      .catch(() => undefined);
  }, []);

  const remember = useCallback((term: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((p) => p.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => undefined);
  };

  const results = useMemo(() => {
    if (q.length < 2) return null;
    return {
      programs: (programs.data ?? []).filter((p) => matches(q, p.name, p.description)).slice(0, MAX_PER_GROUP),
      exercises: (exercises.data ?? [])
        .filter((e) => matches(q, e.name, e.muscleGroup, e.equipment))
        .slice(0, MAX_PER_GROUP),
      recipes: (recipes.data ?? []).filter((r) => matches(q, r.name, ...r.tags)).slice(0, MAX_PER_GROUP),
      pros: (pros.data?.items ?? []).slice(0, MAX_PER_GROUP),
    };
  }, [q, programs.data, exercises.data, recipes.data, pros.data]);

  const total = results ? results.programs.length + results.exercises.length + results.recipes.length + results.pros.length : 0;
  const parent = navigation.getParent();
  const t = trending.data;

  const categories: Array<{ key: string; icon: IconName; tint: string; title: string; subtitle: string; onPress: () => void }> = [
    {
      key: "workouts",
      icon: "dumbbell",
      tint: colors.accent,
      title: "Workouts",
      subtitle: t ? `${t.catalog.workouts} structured sessions` : "Structured sessions",
      onPress: () => parent?.navigate("Train"),
    },
    {
      key: "recipes",
      icon: "utensils",
      tint: colors.success,
      title: "Recipes",
      subtitle: t ? `${t.catalog.recipes} meals with full macros` : "Meals with full macros",
      onPress: () => parent?.navigate("Fuel", { screen: "Recipes" }),
    },
    {
      key: "pros",
      icon: "users",
      tint: colors.aiAccent,
      title: "Professional Guidance",
      subtitle: "Guidance from an available professional",
      onPress: () => parent?.navigate("More", { screen: "CoachDiscovery" }),
    },
  ];

  return (
    <ScreenContainer title="">
      <BackButton onPress={() => navigation.goBack()} />
      <SearchBar
        pill
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => remember(query)}
        placeholder="Search workouts, recipes, professionals..."
        right={<Icon name="mic" size={18} color={colors.textMuted} />}
      />

      {!results ? (
        <View style={{ gap: spacing.lg }}>
          {recent.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <SectionLabel>Recent Searches</SectionLabel>
                <Pressable onPress={clearRecent} accessibilityRole="button" accessibilityLabel="Clear recent searches" hitSlop={8}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Clear</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {recent.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setQuery(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`Search again for ${r}`}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <SectionLabel>Explore Categories</SectionLabel>
            {categories.map((c) => (
              <Pressable
                key={c.key}
                onPress={c.onPress}
                accessibilityRole="button"
                accessibilityLabel={`${c.title}, ${c.subtitle}`}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: 12 }}
              >
                <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.tint, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={c.icon} size={22} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>{c.title}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{c.subtitle}</Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </View>

          {t?.workout ? (
            <View style={{ gap: spacing.sm }}>
              <SectionLabel>Trending Workouts</SectionLabel>
              <Pressable
                onPress={() => parent?.navigate("Train", { screen: "WorkoutDetail", params: { workoutId: t.workout!.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${t.workout.name}, ${t.basis === "most_started_30d" ? "popular" : "featured"} workout`}
              >
                <ImageBackground
                  source={t.workout.imageUrl ? { uri: t.workout.imageUrl } : undefined}
                  style={{ minHeight: 150, justifyContent: "flex-end", backgroundColor: "#000", borderRadius: radius.card, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}
                  imageStyle={{ opacity: 0.55 }}
                >
                  <View style={{ padding: 16, gap: 4 }}>
                    <Text style={{ color: colors.warning, fontSize: 11, letterSpacing: 1, fontFamily: fonts.bodySemi }}>
                      {t.basis === "most_started_30d" ? "POPULAR WORKOUT" : "FEATURED WORKOUT"}
                    </Text>
                    <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t.workout.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                      {capitalise(t.workout.intensity)} · {t.workout.durationMinutes} min · {t.workout.programName}
                    </Text>
                  </View>
                </ImageBackground>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : total === 0 && !pros.isFetching ? (
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
                  onPress={() => {
                    remember(q);
                    parent?.navigate("Train", { screen: "ProgramDetail", params: { programId: p.id } });
                  }}
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
                  onPress={() => {
                    remember(q);
                    parent?.navigate("Train", { screen: "ExerciseDetail", params: { exerciseId: e.id } });
                  }}
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
                  onPress={() => {
                    remember(q);
                    parent?.navigate("Fuel", { screen: "RecipeDetail", params: { recipeId: r.id } });
                  }}
                />
              ))}
            </Group>
          )}
          {results.pros.length > 0 && (
            <Group title="Professionals">
              {results.pros.map((p) => (
                <ListRow
                  key={p.id}
                  icon="users"
                  title={p.fullName}
                  subtitle={p.specializationTags.slice(0, 3).join(" · ") || "Professional"}
                  onPress={() => {
                    remember(q);
                    parent?.navigate("More", { screen: "CoachProfileDetail", params: { professionalId: p.id } });
                  }}
                />
              ))}
            </Group>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={{ color: colors.textMuted, ...typography.label }}>{children}</Text>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.textMuted, ...typography.label }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}
