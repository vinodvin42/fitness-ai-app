import React, { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ExerciseSetLog, UpdateSetInput } from "@fitness-ai-app/types";
import { BottomSheet } from "./BottomSheet";
import { TextField } from "./TextField";
import { Button } from "./Button";
import { useToast } from "./Toast";
import { deleteWorkoutSet, updateWorkoutSet } from "../api/workoutSessions";
import { displayToKg, kgToDisplay, useWorkoutSettings } from "../api/workoutSettings";
import { extractErrorMessage } from "../lib/apiError";
import { spacing } from "../theme/tokens";

interface SetEditSheetProps {
  sessionId: string;
  /** The set being edited; null closes the sheet. */
  set: ExerciseSetLog | null;
  title?: string;
  onClose: () => void;
}

/** Edit weight/reps of a logged set, or delete it (PATCH/DELETE /workout-sessions/:id/sets/:setId). */
export function SetEditSheet({ sessionId, set, title = "Edit set", onClose }: SetEditSheetProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: settings } = useWorkoutSettings();
  const unit = settings?.weightUnit ?? "kg";
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (set) {
      setWeight(set.weightKg != null ? String(kgToDisplay(set.weightKg, unit)) : "");
      setReps(String(set.reps));
      setError(null);
    }
  }, [set, unit]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["workoutSession", sessionId] });
    queryClient.invalidateQueries({ queryKey: ["workoutHistory"] });
    queryClient.invalidateQueries({ queryKey: ["workoutSessions", sessionId, "summary"] });
    queryClient.invalidateQueries({ queryKey: ["trainingAnalytics"] });
  };

  const save = useMutation({
    mutationFn: (input: UpdateSetInput) => updateWorkoutSet(sessionId, (set as ExerciseSetLog).id, input),
    onSuccess: () => {
      refresh();
      toast.show("Set updated", "success");
      onClose();
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't update that set."), "error"),
  });

  const remove = useMutation({
    mutationFn: () => deleteWorkoutSet(sessionId, (set as ExerciseSetLog).id),
    onSuccess: () => {
      refresh();
      toast.show("Set deleted", "success");
      onClose();
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't delete that set."), "error"),
  });

  const onSave = () => {
    if (!set) return;
    const repsNum = parseInt(reps, 10);
    if (!Number.isFinite(repsNum) || repsNum < 1) {
      setError("Reps must be at least 1.");
      return;
    }
    const input: UpdateSetInput = { reps: repsNum };
    if (weight.trim() === "") {
      input.weightKg = null;
    } else {
      const w = parseFloat(weight.replace(",", "."));
      if (!Number.isFinite(w) || w < 0) {
        setError("Enter a valid weight, or leave it empty for bodyweight.");
        return;
      }
      input.weightKg = displayToKg(w, unit);
    }
    setError(null);
    save.mutate(input);
  };

  const confirmDelete = () =>
    Alert.alert("Delete this set?", "It will be removed from this session and your totals.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
    ]);

  return (
    <BottomSheet visible={set !== null} onClose={onClose} title={title}>
      <TextField
        label={`Weight (${unit})`}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder="Bodyweight / none"
      />
      <TextField label="Reps" value={reps} onChangeText={setReps} keyboardType="number-pad" error={error} />
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
        <Button label="Delete" variant="secondary" onPress={confirmDelete} loading={remove.isPending} style={{ flex: 1 }} />
        <Button label="Save" onPress={onSave} loading={save.isPending} style={{ flex: 1 }} />
      </View>
    </BottomSheet>
  );
}
