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
import { fetchStreaks } from "../../api/progress";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ProgramCompletion">;

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Program Completion (docs/mobile/03-screen-inventory.md §I) — a
 * celebration state with real completion metrics (workouts finished, sets
 * logged, days taken), computed from the same /programs/:id/progress data
 * as Program Progress. The design's "award icon" is a plain emoji here — no
 * icon library installed, see the same note on Program Progress.
 * 19 Aug 2026: a real **training-streak card**, reusing GET
 * /progress/streaks (the exact `["progress", "streaks"]` query
 * StreakTrackerScreen already uses, so the cache is shared). This is
 * best-effort — no `isError` handling of its own — because a failed
 * streak fetch shouldn't block an otherwise-working celebration screen;
 * the card just doesn't render if the query hasn't resolved. Not built:
 * milestones (needs a defined milestone system this pass doesn't attempt)
 * and an AI recommendation for what's next (blocked on the AI Coach
 * decision, gap §13).
 */
export function ProgramCompletionScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { programId } = route.params;
  const { data: progress, isLoading, isError, refetch } = useQuery({
    queryKey: ["program", programId, "progress"],
    queryFn: () => fetchProgramProgress(programId),
  });
  // Best-effort: intentionally no isLoading/isError handling here — this
  // card simply doesn't render if the streak data isn't available yet.
  const { data: streaks } = useQuery({ queryKey: ["progress", "streaks"], queryFn: fetchStreaks });
  const trainingStreak = streaks?.categories.find((c) => c.category === "training");

  if (isError) {
    return (
      <ScreenContainer title={t("workout.programComplete.title")}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !progress) {
    return (
      <ScreenContainer title={t("workout.programComplete.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (progress.status !== "completed") {
    return (
      <ScreenContainer title={t("workout.programComplete.title")}>
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.body }}>
            {progress.program.name} isn't finished yet — {progress.completedWorkouts} of {progress.totalWorkouts}{" "}
            workouts complete.
          </Text>
          <Button
            label={t("workout.programComplete.viewProgress")}
            onPress={() => navigation.replace("ProgramProgress", { programId })}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      </ScreenContainer>
    );
  }

  const daysTaken = progress.startedAt && progress.lastCompletedAt ? daysBetween(progress.startedAt, progress.lastCompletedAt) : null;

  return (
    <ScreenContainer title={t("workout.programComplete.title")}>
      <Card>
        <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
          <Text style={{ fontSize: 48 }}>🏆</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.sm, textAlign: "center" }}>
            {progress.program.name} complete!
          </Text>
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.body }}>
          {progress.totalWorkouts} workout{progress.totalWorkouts === 1 ? "" : "s"} finished
        </Text>
        <Text style={{ color: colors.textPrimary, ...typography.body, marginTop: spacing.xs }}>
          {progress.totalSetsLogged} total set{progress.totalSetsLogged === 1 ? "" : "s"} logged
        </Text>
        {daysTaken ? (
          <Text style={{ color: colors.textPrimary, ...typography.body, marginTop: spacing.xs }}>
            Completed in {daysTaken} day{daysTaken === 1 ? "" : "s"}
          </Text>
        ) : null}
        {progress.lastCompletedAt ? (
          <Text style={{ color: colors.textMuted, marginTop: spacing.xs }}>
            Finished {new Date(progress.lastCompletedAt).toLocaleDateString()}
          </Text>
        ) : null}
      </Card>

      {trainingStreak ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textSecondary }}>{t("workout.complete.streak")}</Text>
          <Text style={{ color: colors.textPrimary, ...typography.metricLarge, marginTop: spacing.xs }}>
            {trainingStreak.currentStreak}{" "}
            <Text style={{ ...typography.h2, color: colors.textMuted }}>
              {trainingStreak.currentStreak === 1 ? "day" : "days"}
            </Text>
          </Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
            Longest: {trainingStreak.longestStreak} day{trainingStreak.longestStreak === 1 ? "" : "s"}
          </Text>
        </Card>
      ) : null}

      <Button
        label={t("workout.programComplete.backToMine")}
        onPress={() => navigation.navigate("MyPrograms")}
        style={{ marginTop: spacing.lg }}
      />
      <Button
        label={t("workout.programComplete.browseMore")}
        variant="secondary"
        onPress={() => navigation.navigate("TrainDashboard")}
        style={{ marginTop: spacing.sm }}
      />
    </ScreenContainer>
  );
}
