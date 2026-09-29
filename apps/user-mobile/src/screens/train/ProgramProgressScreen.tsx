import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchProgramProgress } from "../../api/programPurchases";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ProgramProgress">;

/**
 * Program Progress (docs/mobile/03-screen-inventory.md §I) — program meta,
 * a progress bar (percent-complete stand-in for the design's progress
 * circle — no charting/SVG-circle library installed, same simplification
 * as Progress Overview's weight trend), and adherence cards built from real
 * WorkoutSession/ExerciseSetLog data. Not built: a Timeline entry, an AI
 * insight, and the AI Coach FAB — all blocked on the same AI Coach/Timeline
 * decisions as gap §13, not new gaps of their own. No streak card either —
 * Streak Tracker is its own unbuilt screen (§13); a real streak needs a
 * proper "consecutive days/weeks" definition this pass doesn't attempt.
 */
export function ProgramProgressScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { programId } = route.params;
  const { data: progress, isLoading, isError, refetch } = useQuery({
    queryKey: ["program", programId, "progress"],
    queryFn: () => fetchProgramProgress(programId),
  });

  if (isError) {
    return (
      <ScreenContainer title={t("workout.programProgress.title")}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !progress) {
    return (
      <ScreenContainer title={t("workout.programProgress.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const percent = progress.totalWorkouts > 0 ? Math.round((progress.completedWorkouts / progress.totalWorkouts) * 100) : 0;

  return (
    <ScreenContainer title={progress.program.name}>
      <Card>
        <Text style={{ color: colors.textSecondary }}>
          {progress.completedWorkouts} of {progress.totalWorkouts} workouts complete
        </Text>
        <View style={{ height: 10, borderRadius: radius.sm, backgroundColor: colors.border, overflow: "hidden", marginTop: spacing.sm }}>
          <View style={{ height: "100%", width: `${percent}%`, backgroundColor: colors.accent }} />
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.sm }}>{percent}%</Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textSecondary, ...typography.meta, marginBottom: spacing.xs }}>Adherence</Text>
        <Text style={{ color: colors.textPrimary, ...typography.body }}>
          {progress.completedThisWeek} workout{progress.completedThisWeek === 1 ? "" : "s"} completed this week
        </Text>
        <Text style={{ color: colors.textPrimary, ...typography.body, marginTop: spacing.xs }}>
          {progress.totalSetsLogged} total set{progress.totalSetsLogged === 1 ? "" : "s"} logged
        </Text>
        <Text style={{ color: colors.textMuted, marginTop: spacing.xs }}>
          {progress.startedAt
            ? `Started ${new Date(progress.startedAt).toLocaleDateString()}`
            : "Not started yet — begin a workout from Program Detail"}
        </Text>
        {progress.lastCompletedAt ? (
          <Text style={{ color: colors.textMuted, marginTop: spacing.xs }}>
            Last workout completed {new Date(progress.lastCompletedAt).toLocaleDateString()}
          </Text>
        ) : null}
      </Card>

      {progress.status === "completed" ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>🎉 Program complete!</Text>
          <Button
            label={t("workout.programProgress.viewCompletion")}
            onPress={() => navigation.replace("ProgramCompletion", { programId })}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : (
        <Button
          label={t("workout.programProgress.viewWorkouts")}
          variant="secondary"
          onPress={() => navigation.navigate("ProgramDetail", { programId })}
          style={{ marginTop: spacing.lg }}
        />
      )}
    </ScreenContainer>
  );
}
