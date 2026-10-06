import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ExerciseSetLog } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { BackButton } from "../../components/BackButton";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SetEditSheet } from "../../components/SetEditSheet";
import { fetchWorkoutSession } from "../../api/workoutSessions";
import { fetchWorkoutDetail } from "../../api/programs";
import { kgToDisplay, useWorkoutSettings } from "../../api/workoutSettings";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "SessionSets">;

/** Every set logged in one session, grouped by exercise, each editable or deletable (Wave B set edit/delete). */
export function SessionSetsScreen({ navigation, route }: Props) {
  const { sessionId, workoutName } = route.params;
  const [editing, setEditing] = useState<ExerciseSetLog | null>(null);
  const { data: settings } = useWorkoutSettings();
  const unit = settings?.weightUnit ?? "kg";

  const sessionQuery = useQuery({ queryKey: ["workoutSession", sessionId], queryFn: () => fetchWorkoutSession(sessionId) });
  const workoutId = route.params.workoutId ?? sessionQuery.data?.workoutId;
  const workoutQuery = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: () => fetchWorkoutDetail(workoutId as string),
    enabled: !!workoutId,
  });

  const groups = useMemo(() => {
    const names = new Map((workoutQuery.data?.exercises ?? []).map((e) => [e.exercise.id, e.exercise.name]));
    const byEx = new Map<string, ExerciseSetLog[]>();
    for (const s of sessionQuery.data?.setLogs ?? []) {
      byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
    }
    return Array.from(byEx.entries()).map(([exerciseId, sets]) => ({
      exerciseId,
      name: names.get(exerciseId) ?? "Exercise (swapped or removed)",
      sets: [...sets].sort((a, b) => a.setNumber - b.setNumber),
    }));
  }, [sessionQuery.data, workoutQuery.data]);

  return (
    <ScreenContainer title="Review Sets" subtitle={workoutName}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={{ color: colors.textMuted, ...typography.meta }}>Tap a set to fix a typo or remove it.</Text>
      {sessionQuery.isError ? (
        <ErrorState onRetry={() => sessionQuery.refetch()} />
      ) : sessionQuery.isLoading ? (
        <Skeleton height={120} />
      ) : groups.length === 0 ? (
        <EmptyState title="No sets logged" subtitle="This session has no logged sets." />
      ) : (
        groups.map((g) => (
          <Card key={g.exerciseId}>
            <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.xs }}>{g.name}</Text>
            {g.sets.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => setEditing(s)}
                accessibilityRole="button"
                accessibilityLabel={`Edit set ${s.setNumber}`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: spacing.sm,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textPrimary }}>
                  Set {s.setNumber} · {s.reps} reps{s.weightKg != null ? ` @ ${kgToDisplay(s.weightKg, unit)}${unit}` : ""}
                </Text>
                <Text style={{ color: colors.accent, ...typography.meta }}>Edit</Text>
              </Pressable>
            ))}
          </Card>
        ))
      )}
      <View style={{ height: spacing.md }} />
      <SetEditSheet sessionId={sessionId} set={editing} onClose={() => setEditing(null)} />
    </ScreenContainer>
  );
}
