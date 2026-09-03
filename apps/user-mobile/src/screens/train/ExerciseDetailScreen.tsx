import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { fetchExerciseDetail } from "../../api/programs";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ExerciseDetail">;

/**
 * Exercise Detail (trn-06) — docs/mobile/03-screen-inventory.md §C:
 * "a video player, scrollable instructions, and an 'alternatives' section."
 * Shipped 19 Aug 2026. Instructions and alternatives are real (see
 * `Exercise.instructions` and `GET /exercises/:id`'s computed
 * `alternatives`, apps/api/src/modules/programs/programs.service.ts).
 * The video player is deliberately NOT built: `Exercise.mediaUrl` exists
 * as a field but is never populated by this build's seed data, and no
 * video-playback library (`expo-av` or similar) is a dependency here
 * either — building a player with nothing to ever play, on top of a
 * library that isn't even installed, would be exactly the kind of fake UI
 * this project avoids. Instead this screen shows an honest placeholder
 * when `mediaUrl` is empty, and would render nothing to change here once a
 * real video-content pipeline exists — see gap §26.
 */
export function ExerciseDetailScreen({ route, navigation }: Props) {
  const { exerciseId } = route.params;
  const { data: exercise, isLoading, isError, refetch } = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: () => fetchExerciseDetail(exerciseId),
  });

  if (isError) {
    return (
      <ScreenContainer title="Exercise">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !exercise) {
    return (
      <ScreenContainer title="Exercise">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={exercise.name}>
      <Card>
        {exercise.mediaUrl ? (
          <Text style={{ color: colors.textSecondary }}>Video not playable in this build — see gap §26.</Text>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
            <Text style={{ color: colors.textMuted }}>No video for this exercise yet.</Text>
          </View>
        )}
        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
          {exercise.muscleGroup} · {exercise.equipment} · {exercise.difficulty}
        </Text>
      </Card>

      {exercise.instructions.length > 0 ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Instructions</Text>
          {exercise.instructions.map((step, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.accent, ...typography.h2, width: 28 }}>{i + 1}.</Text>
              <Text style={{ color: colors.textSecondary, flex: 1 }}>{step}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {exercise.alternatives.length > 0 ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Alternatives</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {exercise.alternatives.map((alt) => (
                <Pressable
                  key={alt.id}
                  onPress={() => navigation.push("ExerciseDetail", { exerciseId: alt.id })}
                >
                  <Card style={{ width: 160 }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{alt.name}</Text>
                    <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                      {alt.equipment}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}
    </ScreenContainer>
  );
}
