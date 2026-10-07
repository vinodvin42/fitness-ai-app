import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { ErrorState } from "../../components/ErrorState";
import { RestTimer } from "../../components/RestTimer";
import { useWorkoutSettings } from "../../api/workoutSettings";
import { fetchWorkoutDetail } from "../../api/programs";
import { fetchReadiness } from "../../api/recovery";
import { fetchOnboardingProfile } from "../../api/users";
import { fetchPartner, PARTNER_KEY } from "../../api/partner";
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
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

const column = { width: "100%" as const, maxWidth: layout.maxContentWidth, alignSelf: "center" as const };

type Props = NativeStackScreenProps<TrainStackParamList, "ActiveWorkout">;

const RPE_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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
  const { colors: theme } = useTheme();
  const readiness = useQuery({ queryKey: ["readiness"], queryFn: fetchReadiness });
  const profile = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile, staleTime: 60_000 });
  const [whyOpen, setWhyOpen] = useState(false);
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
  const partner = useQuery({ queryKey: PARTNER_KEY, queryFn: fetchPartner, staleTime: 60_000 });
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
      queryClient.invalidateQueries({ queryKey: ["workoutSession", sessionId] });
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
  const score = readiness.data?.score ?? null;
  const context = profile.data?.equipmentContext ?? null;
  const modeTitle = context === "full_gym" ? "Gym Mode" : context ? "Home Mode" : null;
  const currentSetNumber = Math.min(loggedSets.length + 1, currentExercise?.targetSets ?? 1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ ...column, paddingHorizontal: layout.screenPadding, paddingTop: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }}>
          <View style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                alignSelf: "flex-start",
                borderRadius: 6,
                borderWidth: 1,
                borderColor: theme.accent,
                backgroundColor: theme.accentSoft,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 11 }}>
                Exercise {exerciseIndex + 1} of {orderedExercises.length}
                {currentExercise ? ` · ${phaseLabel(currentExercise.phase)}` : ""}
              </Text>
            </View>
            <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }} numberOfLines={1}>
              {workout.name}
            </Text>
          </View>
          {timerStarted ? (
            <Text style={{ color: paused ? colors.textMuted : colors.aiAccent, fontFamily: fonts.mono, fontSize: 18 }}>
              {formatElapsed(elapsedSeconds)}
            </Text>
          ) : null}
          <Pressable
            onPress={() => setPaused((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={paused ? "Resume workout timer" : "Pause workout timer"}
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={paused ? "play" : "pause"} size={18} color={colors.textPrimary} />
          </Pressable>
        </View>
        {paused ? <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>Paused. Logging is disabled until you resume.</Text> : null}
        {wasResumed ? (
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
            Resumed from where you left off — nothing was lost.
          </Text>
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...column, paddingHorizontal: layout.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
          }}
        >
          <Icon name="heart" size={15} color={colors.textMuted} />
          <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
            Heart Rate:{" "}
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold }}>
              {readiness.data?.source?.kind === "device" ? "Not shown during workouts yet" : "No wearable connected"}
            </Text>{" "}
            (Optional — set logging remains available)
          </Text>
        </View>

        {score != null ? (
          <View style={{ backgroundColor: colors.aiSurface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.aiBorder, padding: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 19 }}>
              ✦ Your readiness is {score}/100.{readiness.data?.summary ? ` ${readiness.data.summary}` : ""}
            </Text>
            <Pressable
              onPress={() => setWhyOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Why this readiness?"
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.aiBorder,
                backgroundColor: colors.aiAccentSoft,
              }}
            >
              <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodySemi, fontSize: 12 }}>Why?</Text>
            </Pressable>
          </View>
        ) : null}

        {modeTitle ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 14 }}>{modeTitle}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              Mode changes between exercises. Switching is locked while you're mid-set. Change it from the Train tab.
            </Text>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: theme.accent,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6 }}>ACTIVE EXERCISE</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h1, fontSize: 20 }}>{currentExercise?.exercise.name}</Text>
            {setsRemaining > 0 ? (
              <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                Set {currentSetNumber} of {currentExercise?.targetSets}
              </Text>
            ) : (
              <Text style={{ color: colors.success, fontFamily: fonts.bodyBold, fontSize: 13 }}>All sets done</Text>
            )}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Target: {currentExercise?.targetSets} Sets × {currentExercise?.targetReps} Reps
          </Text>

          {loggedSets.length > 0 ? (
            <View style={{ gap: 4, marginTop: 4 }}>
              {loggedSets.map((s) => (
                <View key={s.setNumber} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Set {s.setNumber}: {s.weightKg ? `${s.weightKg}kg × ` : ""}
                    {s.reps} reps
                  </Text>
                  <Text style={{ color: colors.success, fontSize: 12 }}>✓ Logged{s.rpe ? ` (RPE ${s.rpe})` : ""}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {setsRemaining > 0 ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: 4 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>Weight (kg)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="—"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    value={weight}
                    onChangeText={setWeight}
                    accessibilityLabel="Weight in kilograms"
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>Reps</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="—"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={reps}
                    onChangeText={setReps}
                    accessibilityLabel="Reps"
                  />
                </View>
                <Pressable
                  onPress={onLogSet}
                  disabled={!reps || paused || isSubmittingSet}
                  accessibilityRole="button"
                  accessibilityLabel="Log set"
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: radius.md,
                    backgroundColor: theme.accent,
                    opacity: !reps || paused ? 0.4 : 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isSubmittingSet ? <ActivityIndicator color={theme.textOnAccent} /> : <Icon name="check" size={22} color={theme.textOnAccent} strokeWidth={3} />}
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Rate Difficulty (RPE)</Text>
                <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 11 }}>{rpe ? `RPE ${rpe} — ${rpeLabel(rpe)}` : "Optional"}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {RPE_SCALE.map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => setRpe(rpe === n ? undefined : n)}
                    accessibilityRole="button"
                    accessibilityLabel={`RPE ${n} of 10`}
                    accessibilityState={{ selected: rpe === n }}
                    style={{
                      flex: 1,
                      height: 32,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: rpe === n ? theme.accent : n <= (rpe ?? 0) ? theme.accentSoft : colors.surfaceRaised,
                    }}
                  >
                    <Text style={{ color: rpe === n ? theme.textOnAccent : colors.textSecondary, fontSize: 12, fontFamily: fonts.bodySemi }}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
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
                style={{ flex: 1, height: 38 }}
              />
            ) : null}
            <Button
              label="Set & Rest Tracker"
              variant="secondary"
              onPress={() => navigation.navigate("SetRestTracker", { workoutId, sessionId, exerciseIndex })}
              style={{ flex: 1, height: 38 }}
            />
          </View>
          {partner.data && currentExercise ? (
            <Button
              label="Ask my gym"
              variant="secondary"
              onPress={() => navigation.navigate("GymHelp", { exerciseName: currentExercise.exercise.name, workoutName: workout?.name })}
              style={{ height: 38 }}
            />
          ) : null}
        </View>

        {showRestTimer ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <RestTimer key={loggedSets.length} layout="compact" onDismiss={() => setShowRestTimer(false)} />
          </View>
        ) : null}

        {upNext.length > 0 ? (
          <>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 14 }}>Up Next</Text>
            {upNext.map((ex) => (
              <View
                key={ex.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.sm + 2,
                }}
              >
                {ex.exercise.mediaUrl ? (
                  <Image source={{ uri: ex.exercise.mediaUrl }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceRaised }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="dumbbell" size={18} color={theme.textOnAccent} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{ex.exercise.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    {ex.targetSets} Sets · {ex.targetReps} Reps
                  </Text>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      <View style={{ ...column, paddingHorizontal: layout.screenPadding, paddingVertical: spacing.sm }}>
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
          style={{ marginTop: spacing.xs, height: 34 }}
        />
      </View>

      <ReasoningSheet
        visible={whyOpen}
        onClose={() => setWhyOpen(false)}
        title="Why this readiness?"
        heading="Based on your own logs"
        rationale={readiness.data?.summary ?? readiness.data?.headline ?? "Computed from the recovery data you have logged."}
        rows={(readiness.data?.components ?? []).map((c) => ({ label: c.key, value: `${Math.round(c.score)}/100` }))}
        caveat={readiness.data?.basis ?? "Based on your logged data"}
      />
    </SafeAreaView>
  );
}

function rpeLabel(n: number): string {
  if (n <= 3) return "Easy";
  if (n <= 6) return "Moderate";
  if (n <= 8) return "Hard";
  if (n === 9) return "Very hard";
  return "Max effort";
}

const styles = {
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
  },
} as const;
