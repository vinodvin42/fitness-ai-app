import React from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Routine } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Pill } from "../../components/Pill";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { deleteRoutine, fetchRoutines, ROUTINES_KEY, startRoutine } from "../../api/routines";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "Routines">;

/**
 * My Routines (Train 13). A Routine is a personal list of exercises with
 * target sets/reps/rest. "Start" calls POST /routines/:id/start, which
 * materializes it into a private Workout and opens a live session.
 */
export function RoutinesScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ROUTINES_KEY, queryFn: fetchRoutines });

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
    }, [queryClient]),
  );

  const remove = useMutation({
    mutationFn: (id: string) => deleteRoutine(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
      toast.show("Routine deleted", "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't delete that routine."), "error"),
  });

  const start = useMutation({
    mutationFn: (id: string) => startRoutine(id),
    onSuccess: (res) => navigation.navigate("ActiveWorkout", { workoutId: res.workoutId, sessionId: res.sessionId }),
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't start that routine."), "error"),
  });

  const confirmDelete = (r: Routine) =>
    Alert.alert("Delete routine?", `"${r.name}" will be removed. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(r.id) },
    ]);

  return (
    <ScreenContainer title="My Routines" subtitle="Your saved exercise lists">
      <BackButton onPress={() => navigation.goBack()} />
      <Button label="New routine" onPress={() => navigation.navigate("RoutineEditor", {})} />
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        Save your favourite exercises, then tap Start to run a live session from a routine.
      </Text>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={84} />
          <Skeleton height={84} />
        </View>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No routines yet"
          subtitle="Create one to keep your favourite exercises, sets and rest times in one place."
          actionLabel="Create a routine"
          onAction={() => navigation.navigate("RoutineEditor", {})}
        />
      ) : (
        (data ?? []).map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2, flex: 1 }}>{r.name}</Text>
              <Pill label={`${r.exercises.length} exercise${r.exercises.length === 1 ? "" : "s"}`} tone="accent" />
            </View>
            {r.notes ? <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>{r.notes}</Text> : null}
            {r.exercises.slice(0, 4).map((e) => (
              <Text key={e.id} style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                {e.exerciseName} · {e.targetSets} x {e.targetReps}
              </Text>
            ))}
            {r.exercises.length > 4 ? (
              <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>+{r.exercises.length - 4} more</Text>
            ) : null}
            <Button
              label="Start"
              onPress={() => start.mutate(r.id)}
              disabled={r.exercises.length === 0 || start.isPending}
              loading={start.isPending && start.variables === r.id}
              style={{ marginTop: spacing.md }}
            />
            {r.exercises.length === 0 ? (
              <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                Add at least one exercise to start this routine.
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <Button
                label="Edit"
                variant="secondary"
                onPress={() => navigation.navigate("RoutineEditor", { routineId: r.id })}
                style={{ flex: 1 }}
              />
              <Button label="Delete" variant="secondary" onPress={() => confirmDelete(r)} style={{ flex: 1 }} />
            </View>
          </Card>
        ))
      )}
    </ScreenContainer>
  );
}
