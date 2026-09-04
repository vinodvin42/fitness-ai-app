import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { fetchExerciseDetail } from "../../api/programs";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ExerciseDetail">;

/**
 * Exercise Detail (trn-06) — docs/mobile/03-screen-inventory.md §C:
 * "a video player, scrollable instructions, and an 'alternatives' section."
 * Shipped 19 Aug 2026. Instructions and alternatives are real (see
 * `Exercise.instructions` and `GET /exercises/:id`'s computed
 * `alternatives`, apps/api/src/modules/programs/programs.service.ts).
 * **4 Sep 2026:** `Exercise.mediaUrl` is populated for the first time —
 * with a still demonstration *photo*, not a video (see
 * apps/api/src/lib/seedDatabase.ts for the public-domain source), so this
 * screen now renders it as an image. A video player is still deliberately
 * NOT built: no video-playback library (`expo-av` or similar) is a
 * dependency here, and there is still no video content anywhere in this
 * build to play — gap §26 stays open. Exercises with no photo (the source
 * has no match for "Jog in Place" or "Full Body Stretch") keep the honest
 * empty state below rather than getting an approximately-right picture.
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
          <Image
            source={{ uri: exercise.mediaUrl }}
            style={{
              width: "100%",
              height: 200,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceRaised,
            }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
            <Text style={{ color: colors.textMuted }}>No demonstration photo for this exercise yet.</Text>
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
