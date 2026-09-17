import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { RestTimer } from "../../components/RestTimer";
import { fetchWorkoutDetail } from "../../api/programs";
import { fetchWorkoutSession, logWorkoutSet } from "../../api/workoutSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { sortExercisesByPhase } from "../../lib/workoutExercises";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "SetRestTracker">;

const RPE_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Set/Rest Tracker (docs/mobile/03-screen-inventory.md §C trn-08) — "a
 * focused single-purpose view" branching off Active Workout (trn-07)
 * without leaving the session (docs/mobile/02-information-architecture.md
 * §4), presented here as a modal screen (see TrainStack's `presentation:
 * "modal"` on this route) rather than a full stack push, to match that
 * "without leaving" framing. Built: large weight/reps display, warm-up/
 * drop-set toggles, an RPE scale (ten tappable numbers rather than a
 * continuous slider — no slider control exists anywhere in this app yet,
 * and precise 1-10 taps arguably serve RPE better than a drag gesture
 * would), a rest timer (shared `RestTimer` component, same one Active
 * Workout shows as a post-set overlay), a note field, and a real set
 * history table read from the session's actual persisted `setLogs` (not
 * local-only state — this screen and Active Workout both write to and can
 * both show the same `ExerciseSetLog` rows). Not built: the AI-assisted
 * Exercise Swap this same cross-link also mentions — that's the separate
 * trn-09 screen, still not started (needs the same AI-provider decision as
 * gap §13/§H, not this pass's scope).
 */
export function SetRestTrackerScreen({ route, navigation }: Props) {
  const { workoutId, sessionId, exerciseIndex } = route.params;
  const queryClient = useQueryClient();

  const {
    data: workout,
    isLoading: isWorkoutLoading,
    isError: isWorkoutError,
    refetch: refetchWorkout,
  } = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: () => fetchWorkoutDetail(workoutId),
  });

  const {
    data: session,
    isLoading: isSessionLoading,
    isError: isSessionError,
    refetch: refetchSession,
  } = useQuery({
    queryKey: ["workoutSession", sessionId],
    queryFn: () => fetchWorkoutSession(sessionId),
  });

  const currentExercise = useMemo(() => {
    if (!workout) return undefined;
    return sortExercisesByPhase(workout.exercises)[exerciseIndex];
  }, [workout, exerciseIndex]);

  const exerciseSetLogs = useMemo(() => {
    if (!session || !currentExercise) return [];
    return session.setLogs
      .filter((s) => s.exerciseId === currentExercise.exercise.id)
      .sort((a, b) => a.setNumber - b.setNumber);
  }, [session, currentExercise]);

  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [isWarmup, setIsWarmup] = useState(false);
  const [isDropSet, setIsDropSet] = useState(false);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timerKey, setTimerKey] = useState(0);

  if (isWorkoutError || isSessionError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", paddingHorizontal: spacing.lg }}>
        <ErrorState onRetry={() => { refetchWorkout(); refetchSession(); }} />
      </SafeAreaView>
    );
  }

  if (isWorkoutLoading || isSessionLoading || !workout || !session || !currentExercise) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const onLogSet = async () => {
    if (!reps) return;
    setIsSubmitting(true);
    try {
      await logWorkoutSet(sessionId, {
        exerciseId: currentExercise.exercise.id,
        setNumber: exerciseSetLogs.length + 1,
        reps: parseInt(reps, 10),
        weightKg: weight ? parseFloat(weight) : undefined,
        rpe,
        isWarmup,
        isDropSet,
        note: note.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["workoutSession", sessionId] });
      setReps("");
      setWeight("");
      setRpe(undefined);
      setIsWarmup(false);
      setIsDropSet(false);
      setNote("");
      setTimerKey((k) => k + 1); // remounts RestTimer so it auto-restarts a fresh countdown
    } catch (err) {
      Alert.alert("Couldn't log that set", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>SET / REST TRACKER</Text>
        <Button label="Done" variant="secondary" onPress={() => navigation.goBack()} style={{ height: 36, paddingHorizontal: spacing.md }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h1, textAlign: "center" }}>{currentExercise.exercise.name}</Text>

        <Card>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>WEIGHT (KG)</Text>
              <TextInput
                style={{ color: colors.textPrimary, fontSize: 40, fontFamily: fonts.mono, textAlign: "center", marginTop: spacing.xs }}
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
              />
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>REPS</Text>
              <TextInput
                style={{ color: colors.textPrimary, fontSize: 40, fontFamily: fonts.mono, textAlign: "center", marginTop: spacing.xs }}
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={reps}
                onChangeText={setReps}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, justifyContent: "center" }}>
            <Chip label="Warm-Up" selected={isWarmup} onPress={() => setIsWarmup((v) => !v)} />
            <Chip label="Drop Set" selected={isDropSet} onPress={() => setIsDropSet((v) => !v)} />
          </View>

          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.md, textAlign: "center" }}>
            RPE (PERCEIVED EXERTION)
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs, justifyContent: "center" }}>
            {RPE_SCALE.map((n) => (
              <Chip
                key={n}
                label={String(n)}
                accessibilityLabel={`RPE ${n} of 10`}
                selected={rpe === n}
                onPress={() => setRpe(rpe === n ? undefined : n)}
              />
            ))}
          </View>

          <TextInput
            style={{
              color: colors.textPrimary,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceRaised,
              padding: spacing.sm,
              marginTop: spacing.md,
              minHeight: 44,
            }}
            placeholder={'Add a note (optional) — e.g. "felt easy, form broke down on last rep"'}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={280}
            value={note}
            onChangeText={setNote}
          />

          <Button label="Log Set" onPress={onLogSet} loading={isSubmitting} disabled={!reps} style={{ marginTop: spacing.md }} />
        </Card>

        <Card>
          <RestTimer key={timerKey} defaultSeconds={60} />
        </Card>

        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Set History</Text>
          {exerciseSetLogs.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No sets logged for this exercise yet.</Text>
          ) : (
            exerciseSetLogs.map((s) => (
              <View
                key={s.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: spacing.xs,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary }}>
                    Set {s.setNumber} — {s.reps} reps{s.weightKg ? ` @ ${s.weightKg}kg` : ""}
                    {s.rpe ? ` · RPE ${s.rpe}` : ""}
                  </Text>
                  {s.isWarmup || s.isDropSet ? (
                    <Text style={{ color: colors.textMuted, ...typography.meta }}>
                      {[s.isWarmup ? "Warm-up" : null, s.isDropSet ? "Drop set" : null].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                  {s.note ? <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>“{s.note}”</Text> : null}
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
