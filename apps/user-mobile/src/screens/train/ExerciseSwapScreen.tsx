import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { fetchExerciseDetail } from "../../api/programs";
import { setSwap } from "../../lib/exerciseSwaps";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ExerciseSwap">;

const ALL = "All";

/**
 * Exercise Swap (Figma Train 09). Alternatives come from the real
 * GET /exercises/:id `alternatives` (same muscle group). Selecting one swaps it
 * in for this workout CLIENT-SIDE ONLY (lib/exerciseSwaps.ts) — no endpoint
 * exists to persist a swap. The Figma "% match", "why are you swapping"
 * reasons and "Coach Approved" badges are not backed by data and are omitted.
 */
export function ExerciseSwapScreen({ route, navigation }: Props) {
  const { workoutId, workoutExerciseId, exerciseId } = route.params;
  const { colors: theme } = useTheme();
  const [equipment, setEquipment] = useState(ALL);
  const { data: exercise, isLoading, isError, refetch } = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: () => fetchExerciseDetail(exerciseId),
  });

  const equipmentOptions = useMemo(
    () => [ALL, ...Array.from(new Set((exercise?.alternatives ?? []).map((a) => a.equipment)))],
    [exercise],
  );
  const alternatives = (exercise?.alternatives ?? []).filter((a) => equipment === ALL || a.equipment === equipment);

  if (isError) {
    return (
      <ScreenContainer title="Swap Exercise">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Swap Exercise">
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading || !exercise ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <>
          <Card style={{ padding: spacing.md }}>
            <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 11 }}>CURRENT EXERCISE</Text>
            <Text style={{ color: colors.textPrimary, ...typography.h3, marginTop: 2 }}>{exercise.name}</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
              {exercise.muscleGroup} · {exercise.equipment}
            </Text>
          </Card>

          {equipmentOptions.length > 2 ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Equipment available</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {equipmentOptions.map((eq) => {
                  const selected = eq === equipment;
                  return (
                    <Pressable
                      key={eq}
                      onPress={() => setEquipment(eq)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: selected ? theme.accent : colors.border,
                        backgroundColor: selected ? theme.accentSoft : colors.surface,
                      }}
                    >
                      <Text style={{ color: selected ? theme.accent : colors.textSecondary, ...typography.label, fontSize: 11 }}>
                        {eq}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Alternatives</Text>
          {alternatives.length === 0 ? (
            <EmptyState title="No alternatives" subtitle="There are no other exercises for this muscle group with that equipment." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {alternatives.map((alt) => (
                <View
                  key={alt.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    padding: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 13 }}>{alt.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                      {alt.muscleGroup} · {alt.equipment} · {alt.difficulty}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setSwap(workoutId, workoutExerciseId, alt);
                      navigation.goBack();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Swap to ${alt.name}`}
                    style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 }}
                  >
                    <Text style={{ color: theme.textOnAccent, ...typography.label, fontSize: 11 }}>Select</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={() => {
              setSwap(workoutId, workoutExerciseId, null);
              navigation.goBack();
            }}
            accessibilityRole="button"
            style={{ alignItems: "center", paddingVertical: spacing.sm }}
          >
            <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 14 }}>Keep original exercise</Text>
          </Pressable>
        </>
      )}
    </ScreenContainer>
  );
}
