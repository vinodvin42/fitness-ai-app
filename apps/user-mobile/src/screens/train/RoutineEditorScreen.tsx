import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Exercise, RoutineExerciseInput } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { BottomSheet } from "../../components/BottomSheet";
import { SearchBar } from "../../components/SearchBar";
import { Stepper } from "../../components/Stepper";
import { TextField } from "../../components/TextField";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { createRoutine, fetchRoutine, ROUTINES_KEY, startRoutine, updateRoutine } from "../../api/routines";
import { fetchExercises } from "../../api/programs";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "RoutineEditor">;

interface DraftExercise {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
}

const DEFAULT_REST = 60;

/** Create / edit a routine (Train 13): name, notes, and an ordered list of exercises with sets/reps/rest. */
export function RoutineEditorScreen({ navigation, route }: Props) {
  const routineId = route.params?.routineId;
  const queryClient = useQueryClient();
  const toast = useToast();

  const existing = useQuery({
    queryKey: ["routines", routineId],
    queryFn: () => fetchRoutine(routineId as string),
    enabled: !!routineId,
  });
  const exercisesQuery = useQuery({ queryKey: ["exercises"], queryFn: fetchExercises });

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(!routineId);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (existing.data && !loaded) {
      setName(existing.data.name);
      setNotes(existing.data.notes ?? "");
      setItems(
        [...existing.data.exercises]
          .sort((a, b) => a.order - b.order)
          .map((e) => ({
            exerciseId: e.exerciseId,
            name: e.exerciseName,
            muscleGroup: e.muscleGroup,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            restSeconds: e.restSeconds ?? DEFAULT_REST,
          })),
      );
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exercisesQuery.data ?? []).filter(
      (e) => !q || e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q),
    );
  }, [exercisesQuery.data, search]);

  const buildExercises = (): RoutineExerciseInput[] =>
    items.map((i) => ({
      exerciseId: i.exerciseId,
      targetSets: i.targetSets,
      targetReps: i.targetReps,
      restSeconds: i.restSeconds,
    }));

  // Saves the current draft, then starts a live session from it.
  const saveAndStart = useMutation({
    mutationFn: async () => {
      const exercises = buildExercises();
      const trimmed = notes.trim();
      const saved = routineId
        ? await updateRoutine(routineId, { name: name.trim(), notes: trimmed ? trimmed : null, exercises })
        : await createRoutine({ name: name.trim(), notes: trimmed ? trimmed : undefined, exercises });
      return startRoutine(saved.id);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
      navigation.replace("ActiveWorkout", { workoutId: res.workoutId, sessionId: res.sessionId });
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't start that routine."), "error"),
  });

  const save = useMutation({
    mutationFn: async () => {
      const exercises: RoutineExerciseInput[] = items.map((i) => ({
        exerciseId: i.exerciseId,
        targetSets: i.targetSets,
        targetReps: i.targetReps,
        restSeconds: i.restSeconds,
      }));
      const trimmed = notes.trim();
      if (routineId) {
        return updateRoutine(routineId, { name: name.trim(), notes: trimmed ? trimmed : null, exercises });
      }
      return createRoutine({ name: name.trim(), notes: trimmed ? trimmed : undefined, exercises });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROUTINES_KEY });
      toast.show(routineId ? "Routine updated" : "Routine created", "success");
      navigation.goBack();
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't save that routine."), "error"),
  });

  const patchItem = (index: number, patch: Partial<DraftExercise>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const addExercise = (e: Exercise) => {
    setItems((prev) => [
      ...prev,
      { exerciseId: e.id, name: e.name, muscleGroup: e.muscleGroup, targetSets: 3, targetReps: 10, restSeconds: DEFAULT_REST },
    ]);
    setPickerOpen(false);
    setSearch("");
  };

  const move = (index: number, delta: number) =>
    setItems((prev) => {
      const next = [...prev];
      const j = index + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const onStart = () => {
    if (!name.trim()) {
      setNameError("Give your routine a name.");
      return;
    }
    setNameError(null);
    saveAndStart.mutate();
  };

  const onSave = () => {
    if (!name.trim()) {
      setNameError("Give your routine a name.");
      return;
    }
    setNameError(null);
    save.mutate();
  };

  const title = routineId ? "Edit Routine" : "New Routine";

  if (routineId && existing.isError) {
    return (
      <ScreenContainer title={title}>
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => existing.refetch()} />
      </ScreenContainer>
    );
  }

  if (!loaded) {
    return (
      <ScreenContainer title={title}>
        <Skeleton height={56} />
        <Skeleton height={120} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={title}>
      <BackButton onPress={() => navigation.goBack()} />
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} placeholder="e.g. Push day" error={nameError} />
      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        maxLength={500}
        multiline
        placeholder="Anything to remember about this routine"
      />

      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Exercises</Text>
      {items.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>No exercises yet. Add the first one below.</Text>
      ) : null}
      {items.map((it, index) => (
        <Card key={`${it.exerciseId}-${index}`} style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{it.name}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, textTransform: "capitalize" }}>{it.muscleGroup}</Text>
            </View>
            <SmallAction label="Up" onPress={() => move(index, -1)} disabled={index === 0} />
            <SmallAction label="Down" onPress={() => move(index, 1)} disabled={index === items.length - 1} />
            <SmallAction label="Remove" onPress={() => setItems((prev) => prev.filter((_, i) => i !== index))} />
          </View>
          <Stepper label="Sets" value={it.targetSets} unit="sets" min={1} max={20} onChange={(v) => patchItem(index, { targetSets: v })} />
          <Stepper label="Reps" value={it.targetReps} unit="reps" min={1} max={200} onChange={(v) => patchItem(index, { targetReps: v })} />
          <Stepper
            label="Rest"
            value={it.restSeconds}
            unit="sec"
            step={15}
            min={0}
            max={600}
            onChange={(v) => patchItem(index, { restSeconds: v })}
          />
        </Card>
      ))}
      <Button label="Add exercise" variant="secondary" onPress={() => setPickerOpen(true)} />
      <Button
        label={routineId ? "Save changes" : "Create routine"}
        onPress={onSave}
        loading={save.isPending}
        disabled={saveAndStart.isPending}
      />
      <Button
        label="Save & start workout"
        variant="secondary"
        onPress={onStart}
        loading={saveAndStart.isPending}
        disabled={items.length === 0 || save.isPending}
      />
      {items.length === 0 ? (
        <Text style={{ color: colors.textMuted, ...typography.meta }}>Add at least one exercise to start this routine.</Text>
      ) : null}

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Pick an exercise">
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search exercises or muscle groups" />
        {exercisesQuery.isLoading ? (
          <Skeleton height={48} />
        ) : exercisesQuery.isError ? (
          <ErrorState onRetry={() => exercisesQuery.refetch()} />
        ) : filtered.length === 0 ? (
          <Text style={{ color: colors.textMuted }}>No exercises match.</Text>
        ) : (
          filtered.slice(0, 60).map((e) => (
            <Pressable
              key={e.id}
              onPress={() => addExercise(e)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${e.name}`}
              style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text style={{ color: colors.textPrimary }}>{e.name}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, textTransform: "capitalize" }}>
                {e.muscleGroup} · {e.equipment}
              </Text>
            </Pressable>
          ))
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}

function SmallAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ opacity: disabled ? 0.35 : 1 }}
    >
      <Text style={{ color: colors.accent, ...typography.meta }}>{label}</Text>
    </Pressable>
  );
}
