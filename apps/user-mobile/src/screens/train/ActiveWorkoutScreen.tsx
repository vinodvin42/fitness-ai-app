import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import type { WorkoutPhase } from "@fitness-ai-app/types";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { StepProgressBar } from "../../components/StepProgressBar";
import { ErrorState } from "../../components/ErrorState";
import { RestTimer } from "../../components/RestTimer";
import { useWorkoutSettings } from "../../api/workoutSettings";
import { fetchWorkoutDetail } from "../../api/programs";
import {
  abandonWorkoutSession,
  completeWorkoutSession,
  fetchWorkoutSession,
  logWorkoutSet,
  updateSessionProgress,
} from "../../api/workoutSessions";
import { trackClientEvent } from "../../api/analytics";
import { extractErrorMessage } from "../../lib/apiError";
import { phaseLabel, sortExercisesByPhase } from "../../lib/workoutExercises";
import { applySwaps, clearSwaps, useSwaps } from "../../lib/exerciseSwaps";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

const column = { width: "100%" as const, maxWidth: layout.maxContentWidth, alignSelf: "center" as const };

type Props = NativeStackScreenProps<TrainStackParamList, "ActiveWorkout">;

const RPE_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const PHASE_PILL_COLOR: Record<WorkoutPhase, string> = {
  warmup: colors.warning,
  main: colors.success,
  cooldown: colors.accent,
};

interface LoggedSet {
  setNumber: number;
  reps: number;
  weightKg?: number;
  rpe?: number;
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function PhasePill({ phase }: { phase: WorkoutPhase }) {
  return (
    <View
      style={{
        backgroundColor: PHASE_PILL_COLOR[phase],
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: "#0B0B0F", fontSize: 12, fontFamily: fonts.bodyBold }}>{phaseLabel(phase).toUpperCase()}</Text>
    </View>
  );
}

/**
 * Active Workout (trn-07) — docs/mobile/03-screen-inventory.md §C, "the
 * most complex screen". Phase 1 scope: the core log-a-set loop (weight/reps
 * input + checkmark, moving exercise-to-exercise, finishing the session).
 * Later Phase 1 added trn-07's own RPE slider (here: ten tappable numbers,
 * see SetRestTrackerScreen's comment for why not a continuous slider) and
 * its rest-timer overlay (shared `RestTimer` component, shown as a real
 * `Modal` right after a set is logged, closes on "Continue"/"Skip Rest").
 * A "Set & Rest Tracker" button also opens the dedicated trn-08 screen for
 * warm-up/drop-set toggles, a note field, and a real set-history table —
 * deliberately NOT duplicated inline here too, to keep this screen's own
 * card from getting as dense as that "focused" screen is meant to be.
 *
 * 19 Aug 2026: three more named-but-unbuilt pieces shipped — (1) a real
 * **phase pill** (`PhasePill`, color-coded per warmup/main/cooldown, from
 * the same `phase` data `StepProgressBar`'s label already used); (2) a
 * real **elapsed-time header with a pause control** — a genuine stopwatch
 * seeded from the session's real `startedAt` (`GET /workout-sessions/:id`,
 * same query key `SetRestTrackerScreen` already uses, so the two screens
 * share cache), that stops incrementing while paused (excluding paused
 * time from the total, not just freezing the display) and genuinely blocks
 * logging a set or advancing while paused — this is a real, functional
 * pause of THIS SCREEN's local timer/controls, not a server-persisted
 * "paused" WorkoutSession status (no such status exists — see gap §32);
 * (3) a real **"Up Next" list** — the remaining exercises in
 * `orderedExercises`, already computed for the progress bar, just also
 * rendered as a glanceable list. Still not built: heart-rate banner (needs
 * wearable data, gap §13/§E), AI Why/Override banner (needs an AI-provider
 * decision, gap §13/§H), and a Gym/Home mode toggle — deliberately skipped,
 * see gap §32, since nothing in this app's data model changes based on
 * that toggle yet, and building a toggle with no real effect would be
 * exactly the kind of non-functional UI this project avoids.
 *
 * 20 Aug 2026: a real **"Abandon Workout" action** — closes the explicit-
 * button half of gap §33 (the automatic/background-job half — auto-
 * abandoning sessions after some inactivity threshold — remains a real,
 * separate open gap, since picking that threshold is a product decision
 * this pass has no mandate to invent). Confirmed via the same destructive-
 * `Alert.alert` pattern Progress Photos' Delete already uses; on success
 * the session is marked `"abandoned"` server-side (not silently deleted —
 * any sets already logged stay real, still count toward PRs/streaks
 * exactly as before), `["workoutHistory"]` is invalidated so Today's
 * Continue Workout card and Workout History both immediately stop
 * treating it as in-progress, and the screen pops back to the root of this
 * stack (`navigation.popToTop()`, the same pattern Workout Complete's
 * "Back to Train" already uses).
 *
 * U3 (15 Sep 2026): **real connectivity/app-kill recovery.** Each logged
 * set was already durably persisted server-side the moment it was logged
 * (`ExerciseSetLog`, one row per set) — what wasn't recoverable was WHICH
 * exercise the screen was on: `exerciseIndex`/`loggedSets` were plain
 * `useState`, rebuilt empty on every mount, so resuming an in-progress
 * session (Today's "Resume session") always restarted at exercise 1 with
 * no logged sets shown, even though the real data was sitting on the
 * server the whole time. Fixed two ways: (1) `WorkoutSession` gained a
 * real, server-persisted `currentExerciseIndex` (see its schema.prisma
 * comment) — `onNextExercise` now saves it via `updateSessionProgress`
 * before advancing, so a heuristic re-derived from set counts (wrong for a
 * user who deliberately skips remaining sets and moves on) isn't needed;
 * (2) a one-time hydration effect below reads `session.currentExerciseIndex`
 * and `session.setLogs` on load and seeds `exerciseIndex`/`loggedSets` from
 * them — this also just naturally handles a fresh, never-touched session
 * (empty setLogs → exerciseIndex 0, loggedSets `[]`), so it isn't a
 * resume-only code path. `elapsedSeconds` already correctly re-derived
 * from `session.startedAt` before this pass (line below) — no change
 * needed there. `paused` stays deliberately NOT server-persisted, same
 * reasoning as before: it's a real control of THIS SCREEN's local timer,
 * not a workout-session status.
 */
export function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { workoutId, sessionId } = route.params;
  const queryClient = useQueryClient();
  useWorkoutSettings(); // warm the cache so the rest timer starts at the user's configured length
  const { data: workout, isLoading, isError, refetch } = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: () => fetchWorkoutDetail(workoutId),
  });

  const { data: session } = useQuery({
    queryKey: ["workoutSession", sessionId],
    queryFn: () => fetchWorkoutSession(sessionId),
  });

  // Train 09: client-side exercise swaps (no backend endpoint) layered over the fetched workout.
  const swaps = useSwaps(workoutId);
  const orderedExercises = useMemo(() => {
    if (!workout) return [];
    return sortExercisesByPhase(applySwaps(workout.exercises, swaps));
  }, [workout, swaps]);

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [isSubmittingSet, setIsSubmittingSet] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [wasResumed, setWasResumed] = useState(false);

  // U3 — real connectivity/app-kill recovery, see this screen's own top
  // comment. Runs exactly once, as soon as both the workout (for exercise
  // order) and the session (for currentExerciseIndex/setLogs) are loaded.
  useEffect(() => {
    if (hasHydrated || orderedExercises.length === 0 || !session) return;
    const resumeIndex = Math.min(session.currentExerciseIndex, orderedExercises.length - 1);
    const resumeExercise = orderedExercises[resumeIndex];
    const resumedSets: LoggedSet[] = resumeExercise
      ? session.setLogs
          .filter((l) => l.exerciseId === resumeExercise.exercise.id)
          .sort((a, b) => a.setNumber - b.setNumber)
          .map((l) => ({ setNumber: l.setNumber, reps: l.reps, weightKg: l.weightKg ?? undefined, rpe: l.rpe ?? undefined }))
      : [];
    setExerciseIndex(resumeIndex);
    setLoggedSets(resumedSets);
    const resumedForReal = resumeIndex > 0 || resumedSets.length > 0;
    setWasResumed(resumedForReal);
    setHasHydrated(true);

    // §8 "workout.sync_recovered" — only when hydration actually restored
    // non-empty progress (the real "temporary connectivity loss didn't lose
    // active data" moment, see this screen's own top comment), never on a
    // fresh session that naturally hydrates to index 0 / empty sets.
    if (resumedForReal) {
      trackClientEvent("workout.sync_recovered", { workoutSessionId: session.id }, { resumeIndex, resumedSetCount: resumedSets.length });
    }
  }, [hasHydrated, orderedExercises, session]);

  // A real stopwatch, not a re-derived "now minus startedAt" clock — pausing
  // stops the interval below, so paused time is genuinely excluded from the
  // total rather than the display just freezing while the real elapsed time
  // keeps accruing underneath.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerStarted, setTimerStarted] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!session || timerStarted) return;
    const startedAt = new Date(session.startedAt).getTime();
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    setTimerStarted(true);
  }, [session, timerStarted]);

  useEffect(() => {
    if (!timerStarted || paused) return;
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [timerStarted, paused]);

  const currentExercise = orderedExercises[exerciseIndex];
  const isLastExercise = exerciseIndex === orderedExercises.length - 1;

  if (isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", paddingHorizontal: spacing.lg }}>
        <ErrorState onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }

  if (isLoading || !workout) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const onLogSet = async () => {
    if (!currentExercise || !reps || paused) return;
    setIsSubmittingSet(true);
    try {
      const setNumber = loggedSets.length + 1;
      const parsedReps = parseInt(reps, 10);
      const parsedWeight = weight ? parseFloat(weight) : undefined;
      await logWorkoutSet(sessionId, {
        exerciseId: currentExercise.exercise.id,
        setNumber,
        reps: parsedReps,
        weightKg: parsedWeight,
        rpe,
      });
      setLoggedSets((prev) => [...prev, { setNumber, reps: parsedReps, weightKg: parsedWeight, rpe }]);
      setReps("");
      setRpe(undefined);
      setShowRestTimer(true);
    } catch (err) {
      Alert.alert("Couldn't log that set", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmittingSet(false);
    }
  };

  const onNextExercise = async () => {
    if (paused) return;
    if (isLastExercise) {
      setIsFinishing(true);
      try {
        await completeWorkoutSession(sessionId);
        clearSwaps(workoutId);
        navigation.replace("WorkoutComplete", { sessionId, workoutName: workout.name });
      } catch (err) {
        Alert.alert("Couldn't finish workout", extractErrorMessage(err, "Check your connection and try again."));
      } finally {
        setIsFinishing(false);
      }
      return;
    }
    const nextIndex = exerciseIndex + 1;
    setIsAdvancing(true);
    try {
      // Persisted server-side BEFORE the local state changes, so a
      // connectivity drop right here never leaves the client "ahead" of
      // what the server can recover on the next load.
      await updateSessionProgress(sessionId, nextIndex);
      setExerciseIndex(nextIndex);
      setLoggedSets([]);
      setReps("");
      setWeight("");
      setRpe(undefined);
    } catch (err) {
      Alert.alert("Couldn't move to the next exercise", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsAdvancing(false);
    }
  };

  const onAbandon = () => {
    Alert.alert(
      "Abandon this workout?",
      "Any sets you've already logged are kept, but this session won't count as completed. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Abandon Workout",
          style: "destructive",
          onPress: async () => {
            setIsAbandoning(true);
            try {
              await abandonWorkoutSession(sessionId);
              clearSwaps(workoutId);
              await queryClient.invalidateQueries({ queryKey: ["workoutHistory"] });
              navigation.popToTop();
            } catch (err) {
              Alert.alert("Couldn't abandon workout", extractErrorMessage(err, "Check your connection and try again."));
            } finally {
              setIsAbandoning(false);
            }
          },
        },
      ],
    );
  };

  const setsRemaining = currentExercise ? Math.max(0, currentExercise.targetSets - loggedSets.length) : 0;
  const upNext = orderedExercises.slice(exerciseIndex + 1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Modal visible={showRestTimer} transparent animationType="fade" onRequestClose={() => setShowRestTimer(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          <Card style={{ width: "100%", maxWidth: 360 }}>
            <RestTimer onDismiss={() => setShowRestTimer(false)} />
          </Card>
        </View>
      </Modal>

      <View style={{ ...column, paddingHorizontal: layout.screenPadding, paddingTop: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          {currentExercise ? <PhasePill phase={currentExercise.phase} /> : <View />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            {timerStarted ? (
              <Text style={{ color: paused ? colors.textMuted : colors.textPrimary, ...typography.h2 }}>
                {formatElapsed(elapsedSeconds)}
                {paused ? " · paused" : ""}
              </Text>
            ) : null}
            <Button
              label={paused ? "Resume" : "Pause"}
              variant="secondary"
              onPress={() => setPaused((p) => !p)}
              style={{ height: 32, paddingHorizontal: spacing.md }}
            />
          </View>
        </View>
        <StepProgressBar
          step={exerciseIndex + 1}
          total={orderedExercises.length}
          caption={`Step ${exerciseIndex + 1} of ${orderedExercises.length}${currentExercise ? ` — ${phaseLabel(currentExercise.phase)}` : ""}`}
          showBrand={false}
        />
        {wasResumed ? (
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
            Resumed from where you left off — nothing was lost.
          </Text>
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...column, paddingHorizontal: layout.screenPadding, paddingBottom: spacing.lg, gap: spacing.md }}
      >
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{currentExercise?.exercise.name}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
            Target: {currentExercise?.targetSets} sets × {currentExercise?.targetReps} reps
          </Text>
          {currentExercise && loggedSets.length === 0 ? (
            <Button
              label="Swap Exercise"
              variant="secondary"
              onPress={() =>
                navigation.navigate("ExerciseSwap", {
                  workoutId,
                  workoutExerciseId: currentExercise.id,
                  exerciseId: currentExercise.exercise.id,
                })
              }
              style={{ marginTop: spacing.sm, height: 40 }}
            />
          ) : null}
          <Button
            label="Open Set & Rest Tracker"
            variant="secondary"
            onPress={() => navigation.navigate("SetRestTracker", { workoutId, sessionId, exerciseIndex })}
            style={{ marginTop: spacing.sm, height: 40 }}
          />
        </Card>

        {loggedSets.length > 0 ? (
          <Card>
            {loggedSets.map((s) => (
              <Text key={s.setNumber} style={{ color: colors.success, ...typography.meta, marginBottom: 2 }}>
                ✓ Set {s.setNumber} — {s.reps} reps{s.weightKg ? ` @ ${s.weightKg}kg` : ""}
                {s.rpe ? ` · RPE ${s.rpe}` : ""}
              </Text>
            ))}
          </Card>
        ) : null}

        {setsRemaining > 0 ? (
          <Card>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>
              Log set {loggedSets.length + 1} of {currentExercise?.targetSets}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TextInput
                style={styles.input}
                placeholder="Reps"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={reps}
                onChangeText={setReps}
              />
              <TextInput
                style={styles.input}
                placeholder="Weight (kg, optional)"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={weight}
                onChangeText={setWeight}
              />
            </View>

            <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
              RPE (perceived exertion, optional)
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs }}>
              {RPE_SCALE.map((n) => (
                <Chip key={n} label={String(n)} selected={rpe === n} onPress={() => setRpe(rpe === n ? undefined : n)} />
              ))}
            </View>

            <Button
              label="Log Set"
              onPress={onLogSet}
              loading={isSubmittingSet}
              disabled={!reps || paused}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        ) : null}

        {upNext.length > 0 ? (
          <Card>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>Up Next</Text>
            {upNext.map((ex) => (
              <View key={ex.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
                <View>
                  <Text style={{ color: colors.textPrimary }}>{ex.exercise.name}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>{phaseLabel(ex.phase)}</Text>
                </View>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  {ex.targetSets} × {ex.targetReps}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <View style={{ ...column, paddingHorizontal: layout.screenPadding, paddingVertical: spacing.md }}>
        <Button
          label={isLastExercise ? "Finish Workout" : "Next Exercise"}
          onPress={onNextExercise}
          loading={isFinishing || isAdvancing}
          disabled={paused}
          variant={setsRemaining > 0 ? "secondary" : "primary"}
        />
        <Button
          label="Abandon Workout"
          variant="secondary"
          onPress={onAbandon}
          loading={isAbandoning}
          style={{ marginTop: spacing.sm, height: 40 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = {
  input: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
  },
} as const;
