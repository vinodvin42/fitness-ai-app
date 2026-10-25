import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { ExerciseMotion } from "../../components/ExerciseMotion";
import { MediaVideo } from "../../components/MediaVideo";
import { VideoCredit } from "../../components/VideoCredit";
import { useToast } from "../../components/Toast";
import { fetchExerciseDetail } from "../../api/programs";
import { fetchRoutines, ROUTINES_KEY, updateRoutine } from "../../api/routines";
import { extractErrorMessage } from "../../lib/apiError";
import { creditLine, hasExerciseVideo, playerShape } from "../../lib/exerciseVideo";
import { BRAND_NAME } from "../../lib/brand";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ExerciseDetail">;

/**
 * Exercise Detail (Figma Train 06): media area, name + difficulty badge,
 * target muscle chip, numbered step-by-step form guide, an alternative card
 * and the Add to Workout / Try Alternative actions.
 *
 * Only real data is rendered. An exercise with a video (Exercise.video, Oct
 * 2026) shows it framed by its shape (portrait clips whole, in a 4:5 box; see
 * lib/exerciseVideo.ts playerShape), its own still as the poster, tap to play,
 * muted and looping, with its credit line
 * underneath (a licensed clip without a full credit isn't shown at all). Without
 * one, `Exercise.mediaUrl` is a still photo: for the seeded free-exercise-db
 * photos the media area alternates the start and end stills
 * (components/ExerciseMotion); any other photo shows as a still, and no
 * photo gets an honest empty note. The design's "Common Mistakes", "Pro Tips" and
 * secondary-muscle chips have no backing data and are not shown. "Add to
 * Workout" appends the exercise to one of the user's saved routines (the
 * app's editable workouts); "Try Alternative" opens the real same-muscle-
 * group alternatives from `GET /exercises/:id`.
 */
export function ExerciseDetailScreen({ route, navigation }: Props) {
  const { exerciseId } = route.params;
  const { colors: theme } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: exercise, isLoading, isError, refetch } = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: () => fetchExerciseDetail(exerciseId),
  });
  const routines = useQuery({ queryKey: ROUTINES_KEY, queryFn: fetchRoutines, enabled: pickerOpen });

  const addToRoutine = useMutation({
    mutationFn: (routineId: string) => {
      const routine = (routines.data ?? []).find((r) => r.id === routineId);
      if (!routine) throw new Error("Routine not found");
      return updateRoutine(routineId, {
        exercises: [
          ...[...routine.exercises]
            .sort((a, b) => a.order - b.order)
            .map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetReps: e.targetReps, restSeconds: e.restSeconds })),
          { exerciseId, targetSets: 3, targetReps: 10 },
        ],
      });
    },
    onSuccess: (routine) => {
      queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
      setPickerOpen(false);
      toast.show(`Added to ${routine.name}`, "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't add that exercise."), "error"),
  });

  if (isError) {
    return (
      <ScreenContainer title="Exercise" onBack={() => navigation.goBack()}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !exercise) {
    return (
      <ScreenContainer title="Exercise" onBack={() => navigation.goBack()}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const difficultyColor = { beginner: colors.success, intermediate: colors.warning, advanced: colors.orange }[exercise.difficulty];
  const alternative = exercise.alternatives[0];

  return (
    <ScreenContainer title="Exercise Detail" onBack={() => navigation.goBack()}>

      {hasExerciseVideo(exercise) ? (
        <View style={{ gap: spacing.xs }}>
          <MediaVideo
            video={exercise.video}
            {...playerShape(exercise.video)}
            poster={exercise.video.posterUrl ?? null}
            loop
            hasSound={false}
            label={`${exercise.name} video`}
          />
          {(() => {
            const credit = creditLine(exercise.video);
            return credit ? <VideoCredit credit={credit} /> : null;
          })()}
        </View>
      ) : exercise.mediaUrl ? (
        <ExerciseMotion mediaUrl={exercise.mediaUrl} exerciseName={exercise.name} height={220} />
      ) : (
        <View
          style={{
            height: 140,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Icon name="dumbbell" size={26} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, ...typography.meta }}>No demonstration photo for this exercise yet.</Text>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{exercise.name}</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
            {exercise.muscleGroup} · {exercise.equipment}
          </Text>
        </View>
        <View style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: difficultyColor, paddingHorizontal: 12, paddingVertical: 4 }}>
          <Text style={{ color: difficultyColor, fontFamily: fonts.bodyBold, fontSize: 13, textTransform: "capitalize" }}>{exercise.difficulty}</Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border }} />

      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 14 }}>Target Muscles</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <View style={{ borderRadius: radius.sm, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentSoft, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>{exercise.muscleGroup} (Primary)</Text>
        </View>
      </View>

      {exercise.instructions.length > 0 ? (
        <>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 14, marginTop: spacing.sm }}>Step-by-Step Form Guide</Text>
          <View style={{ gap: 12 }}>
            {exercise.instructions.map((step, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: theme.textOnAccent, fontFamily: fonts.bodyBold, fontSize: 13 }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{step}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text style={{ color: colors.textMuted, ...typography.meta }}>No form guide has been written for this exercise yet.</Text>
      )}

      {alternative ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            backgroundColor: colors.aiSurface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.aiBorder,
            padding: spacing.md,
            marginTop: spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.aiText, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.6 }}>
              {BRAND_NAME.toUpperCase()} ALTERNATIVE
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 18 }}>
              {alternative.name} also works your {alternative.muscleGroup.toLowerCase()} using {alternative.equipment.toLowerCase()}.
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.push("ExerciseDetail", { exerciseId: alternative.id })}
            accessibilityRole="button"
            accessibilityLabel={`View ${alternative.name}`}
            style={{ backgroundColor: colors.aiAccent, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 }}
          >
            <Text style={{ color: "#0B0B0F", fontFamily: fonts.bodyBold, fontSize: 13 }}>View</Text>
          </Pressable>
        </View>
      ) : null}

      <Button label="Add to Workout" onPress={() => setPickerOpen(true)} style={{ marginTop: spacing.sm }} />
      {alternative ? (
        <Button label="Try Alternative" variant="secondary" onPress={() => navigation.push("ExerciseDetail", { exerciseId: alternative.id })} />
      ) : null}

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Add to a routine">
        <View style={{ padding: spacing.md, paddingTop: 0, gap: spacing.sm }}>
          {routines.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
          {(routines.data ?? []).map((r) => (
            <Pressable
              key={r.id}
              onPress={() => addToRoutine.mutate(r.id)}
              disabled={addToRoutine.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Add to ${r.name}`}
              style={{
                backgroundColor: colors.surfaceRaised,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
              }}
            >
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{r.name}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>{r.exercises.length} exercises</Text>
            </Pressable>
          ))}
          {routines.data && routines.data.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>You have no saved routines yet.</Text>
          ) : null}
          <Button
            label="Create new routine"
            variant="secondary"
            onPress={() => {
              setPickerOpen(false);
              navigation.navigate("RoutineEditor", {});
            }}
          />
        </View>
      </BottomSheet>
    </ScreenContainer>
  );
}
