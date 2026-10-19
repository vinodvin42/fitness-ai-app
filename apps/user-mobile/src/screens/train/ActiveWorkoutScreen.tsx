import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ExerciseSetLog, WorkoutSession } from "@fitness-ai-app/types";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { ErrorState } from "../../components/ErrorState";
import { RestTimer } from "../../components/RestTimer";
import { SetQuickEditSheet } from "../../components/SetQuickEditSheet";
import { ExerciseMenuSheet, type ExerciseMenuItem } from "../../components/ExerciseMenuSheet";
import { PlateCalculatorSheet } from "../../components/PlateCalculatorSheet";
import { SetEditSheet } from "../../components/SetEditSheet";
import { AddExerciseSheet } from "../../components/AddExerciseSheet";
import { clearExerciseRest, setExerciseRest, useWorkoutSettings } from "../../api/workoutSettings";
import { fetchExercises, fetchWorkoutDetail } from "../../api/programs";
import { fetchReadiness } from "../../api/recovery";
import { fetchOnboardingProfile } from "../../api/users";
import {
  abandonWorkoutSession,
  completeWorkoutSession,
  fetchSessionSummary,
  fetchWorkoutHistory,
  fetchWorkoutSession,
  addSessionExercise,
  logWorkoutSet,
  removeSessionExercise,
  updateSessionExercise,
  updateSessionProgress,
} from "../../api/workoutSessions";
import { trackClientEvent } from "../../api/analytics";
import { extractErrorMessage } from "../../lib/apiError";
import { readinessFactorLabel } from "../../lib/readinessFactors";
import { phaseLabel } from "../../lib/workoutExercises";
import { clearSwaps, useSwaps } from "../../lib/exerciseSwaps";
import { buildSessionExerciseList } from "../../lib/sessionExerciseList";
import { afterWorkingSet, nextFreeLetter, supersetLabel } from "../../lib/supersets";
import { nextSetNumber, setLogsFor, withSetLog } from "../../lib/setNumbering";
import {
  formatSetValues,
  formatWeight,
  isBarbell,
  loadingStepKg,
  previousSessionId,
  setRowLabels,
  warmUpSets,
  type SetValues,
} from "../../lib/fastLogging";
import { formatMmSs } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, layout, radius, spacing, typography, themed } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";
import { exitTaskToHome } from "../../navigation/taskExits";

const column = { width: "100%" as const, maxWidth: layout.maxContentWidth, alignSelf: "center" as const };

type Props = NativeStackScreenProps<TrainStackParamList, "ActiveWorkout">;

/**
 * Runs one navigation call with the leave prompt switched off, then re-arms
 * it. `beforeRemove` fires synchronously inside the call (@react-navigation/core
 * 6.4.17, useOnAction → shouldPreventRemove), so resetting in `finally` also
 * covers a call that ends up not removing this screen.
 */
export function leaveWithoutPrompt(allowLeave: { current: boolean }, go: () => void) {
  allowLeave.current = true;
  try {
    go();
  } finally {
    allowLeave.current = false;
  }
}

interface LoggedSet {
  id: string;
  setNumber: number;
  reps: number;
  weightKg?: number;
  rpe?: number;
  isWarmup: boolean;
  isDropSet: boolean;
  isFailure: boolean;
}

/** A working set's type (warm-ups come from the generator). Batch 3b: drop and failure are separate. */
type SetType = "normal" | "drop" | "failure";
const REST_CHOICES = [30, 45, 60, 90, 120, 150, 180, 240];

/** Which row the quick-edit sheet is changing: the next set, or one generated warm-up. */
type QuickEditTarget = { kind: "active" } | { kind: "warmup"; index: number };

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
 * treating it as in-progress, and the screen returns to Workouts home
 * (`exitTaskToHome`, navigation/taskExits.ts, the same exit Workout
 * Complete's "Back to Training" uses; it also works when this screen is
 * the only one in the stack).
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
 * on load and seeds `exerciseIndex` from it — this also just naturally
 * handles a fresh, never-touched session (exerciseIndex 0), so it isn't a
 * resume-only code path. The logged sets are not copied into local state:
 * they are read from the shared session data on every render (Oct 2026,
 * lib/setNumbering.ts), and logging waits until this hydration has run.
 * `elapsedSeconds` already correctly re-derived
 * from `session.startedAt` before this pass (line below) — no change
 * needed there. `paused` stays deliberately NOT server-persisted, same
 * reasoning as before: it's a real control of THIS SCREEN's local timer,
 * not a workout-session status.
 *
 * Oct 2026, Figma 03b fast logging: the card is now a set table (SET ·
 * PREVIOUS · KG · REPS · ✓). The next set is pre-filled from this visit's last
 * numbered set, else the same set in the last completed session of this
 * workout, else the target reps, so ✓ is usually the only tap; tapping a
 * number opens the quick-edit sheet (steppers, "Same as last set", optional
 * RPE) and tapping a logged row opens the existing edit/delete sheet. The ⋯
 * menu holds warm-up generation (logged with isWarmup), replace exercise,
 * the Set & Rest Tracker, the rest timer and, for barbells, the plate
 * calculator. Still one exercise at a time (Figma shows every exercise on one
 * sheet).
 *
 * Batch 3b (18 Oct 2026): the exercise list is the session's own list from
 * the API (lib/sessionExerciseList.ts; the Set/Rest Tracker builds it the same
 * way), so swaps survive a restart; "+ Add exercise", "Superset with…" (A1 then
 * A2, rest after the last — lib/supersets.ts), "Remove from this workout"
 * (before any set) and a per-exercise rest choice change it. The next set can
 * be Normal, Drop set or To failure (quick-edit sheet; labels D / F).
 */
export function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { workoutId, sessionId } = route.params;
  const queryClient = useQueryClient();
  const { colors: theme } = useTheme();
  const readiness = useQuery({ queryKey: ["readiness"], queryFn: fetchReadiness });
  const profile = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile, staleTime: 60_000 });
  const [whyOpen, setWhyOpen] = useState(false);
  // Also warms the cache so the rest timer starts at the user's configured length.
  const { data: workoutSettings } = useWorkoutSettings();
  const { data: workout, isLoading, isError, refetch } = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: () => fetchWorkoutDetail(workoutId),
  });

  const { data: session } = useQuery({
    queryKey: ["workoutSession", sessionId],
    queryFn: () => fetchWorkoutSession(sessionId),
  });

  // Batch 3b (18 Oct 2026): the session's own list from the API (swaps, added exercises, supersets);
  // sessions without one fall back to the template + this device's client-side swaps (Train 09).
  const swaps = useSwaps(workoutId);
  const orderedExercises = useMemo(() => buildSessionExerciseList(workout, session, swaps), [workout, session, swaps]);

  // Figma 03b "PREVIOUS": the last completed session of this same workout.
  const { data: history } = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory });
  const prevSessionId = previousSessionId(history, workoutId, sessionId);
  const { data: previousSession } = useQuery({
    queryKey: ["workoutSession", prevSessionId],
    queryFn: () => fetchWorkoutSession(prevSessionId as string),
    enabled: !!prevSessionId,
  });

  const [exerciseIndex, setExerciseIndex] = useState(0);
  // The next set's numbers. null = use the pre-filled defaults (last set, else last time, else the target).
  const [draft, setDraft] = useState<{ weight: string; reps: string } | null>(null);
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [pendingWarmups, setPendingWarmups] = useState<SetValues[]>([]);
  const [warmupsAddedFrom, setWarmupsAddedFrom] = useState<number | null>(null);
  const [extraSets, setExtraSets] = useState(0);
  const [quickEdit, setQuickEdit] = useState<QuickEditTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [platesOpen, setPlatesOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<ExerciseSetLog | null>(null);
  // Batch 3b: the next set's type, and the sheets for add / superset / rest.
  const [setType, setSetType] = useState<SetType>("normal");
  const [addOpen, setAddOpen] = useState(false);
  const [supersetOpen, setSupersetOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const exerciseLibrary = useQuery({ queryKey: ["exercises"], queryFn: fetchExercises, enabled: addOpen });
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
    const resumedSetCount = resumeExercise ? setLogsFor(session.setLogs, resumeExercise.exercise.id).length : 0;
    setExerciseIndex(resumeIndex);
    const resumedForReal = resumeIndex > 0 || resumedSetCount > 0;
    setWasResumed(resumedForReal);
    setHasHydrated(true);

    // §8 "workout.sync_recovered" — only when hydration actually restored
    // non-empty progress (the real "temporary connectivity loss didn't lose
    // active data" moment, see this screen's own top comment), never on a
    // fresh session that naturally hydrates to index 0 / empty sets.
    if (resumedForReal) {
      trackClientEvent("workout.sync_recovered", { workoutSessionId: session.id }, { resumeIndex, resumedSetCount });
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

  // Focused task (Oct 2026): leaving an active workout is deliberate.
  // Removal actions on this stack (Android back, goBack/pop/replace…) ask
  // first. "Leave for now" leaves with the session still in progress: logged
  // sets are saved server-side, but unlogged inputs and the rest timer are
  // screen state and are cleared. "Discard workout" runs the existing
  // abandon flow. Finishing and abandoning go through `leaveWithoutPrompt`,
  // and while the workout is still loading or failed, back works as before.
  const allowLeave = useRef(false);
  const guardReady = useRef(false);
  guardReady.current = Boolean(workout);
  const abandonRef = useRef<() => void>(() => undefined);
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (allowLeave.current || !guardReady.current) return;
        e.preventDefault();
        Alert.alert(
          "Leave workout?",
          "Your logged sets stay saved and the workout stays open. Anything you haven't logged yet and the rest timer will be cleared, and time away counts toward the workout's duration.",
          [
            { text: "Stay", style: "cancel" },
            { text: "Discard workout", style: "destructive", onPress: () => abandonRef.current() },
            { text: "Leave for now", onPress: () => leaveWithoutPrompt(allowLeave, () => navigation.dispatch(e.data.action)) },
          ],
        );
      }),
    [navigation],
  );

  const currentExercise = orderedExercises[exerciseIndex];
  // This exercise's recorded sets, read from the shared session data (the same cache the Set/Rest Tracker reads
  // and writes), so a set logged or deleted there shows here too and a number is never reused.
  const loggedSets: LoggedSet[] = useMemo(
    () =>
      currentExercise && session
        ? setLogsFor(session.setLogs, currentExercise.exercise.id).map((l) => ({
            id: l.id,
            setNumber: l.setNumber,
            reps: l.reps,
            weightKg: l.weightKg ?? undefined,
            rpe: l.rpe ?? undefined,
            isWarmup: l.isWarmup,
            isDropSet: l.isDropSet,
            isFailure: !!l.isFailure,
          }))
        : [],
    [currentExercise, session],
  );
  const isLastExercise = exerciseIndex === orderedExercises.length - 1;

  // Per-exercise screen state starts fresh on each exercise (logged sets live in the session data).
  const currentExerciseId = currentExercise?.exercise.id;
  useEffect(() => {
    setDraft(null);
    setRpe(undefined);
    setPendingWarmups([]);
    setWarmupsAddedFrom(null);
    setExtraSets(0);
    setSetType("normal");
  }, [currentExerciseId]);

  // Personal-best badge: the same "beats every earlier session" rule Workout Complete uses, read mid-session.
  const hasLoggedSets = (session?.setLogs.length ?? 0) > 0;
  const { data: liveSummary } = useQuery({
    queryKey: ["workoutSessions", sessionId, "summary", "live"],
    queryFn: () => fetchSessionSummary(sessionId),
    enabled: hasLoggedSets,
  });

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

  // ---- Fast logging (Figma 03b): one row per set, pre-filled so ✓ is usually the only tap.
  const exerciseId = currentExercise?.exercise.id ?? "";
  const rowLabels = setRowLabels(loggedSets);
  const workingLogged = loggedSets.filter((s) => !s.isWarmup);
  // Numbered sets only (no warm-ups or drop sets), so "previous" and the pre-fill line up with the 1..n labels.
  const numberedLogged = workingLogged.filter((s) => !s.isDropSet && !s.isFailure);
  const lastWorking = numberedLogged[numberedLogged.length - 1];
  const previousWorking = previousSession
    ? setLogsFor(previousSession.setLogs, exerciseId).filter((l) => !l.isWarmup && !l.isDropSet && !l.isFailure)
    : [];
  const previousFor = (workingNumber: number): SetValues | undefined => {
    const p = previousWorking[workingNumber - 1];
    return p ? { weightKg: p.weightKg ?? undefined, reps: p.reps } : undefined;
  };
  const nextWorkingNumber = numberedLogged.length + 1;
  const lastTime = previousFor(nextWorkingNumber);
  const prefill = lastWorking ? { weightKg: lastWorking.weightKg, reps: lastWorking.reps } : lastTime;
  const active = draft ?? {
    weight: prefill?.weightKg != null ? formatWeight(prefill.weightKg) : "",
    reps: String(prefill?.reps ?? currentExercise?.targetReps ?? ""),
  };
  const activeReps = parseInt(active.reps, 10);
  const pr = liveSummary?.newPersonalRecords.find((r) => r.exerciseId === exerciseId);
  const prSetId = pr ? workingLogged.find((s) => s.weightKg === pr.weightKg && s.reps === pr.reps)?.id : undefined;

  const onLogSet = async (warmupIndex?: number) => {
    // Waits for the session to load and this screen's resume to run, so the number comes from the recorded sets.
    if (!currentExercise || paused || !hasHydrated || !session) return;
    const warmup = warmupIndex != null ? pendingWarmups[warmupIndex] : undefined;
    const reps = warmup ? warmup.reps : activeReps;
    if (!(reps > 0)) return;
    setIsSubmittingSet(true);
    try {
      const created = await logWorkoutSet(sessionId, {
        exerciseId: currentExercise.exercise.id,
        setNumber: nextSetNumber(loggedSets),
        reps,
        weightKg: warmup ? warmup.weightKg : active.weight ? parseFloat(active.weight) : undefined,
        rpe: warmup ? undefined : rpe,
        isWarmup: warmup ? true : undefined,
        isDropSet: !warmup && setType === "drop" ? true : undefined,
        isFailure: !warmup && setType === "failure" ? true : undefined,
      });
      // Into the shared session data right away (both screens number from it), then refetched for the server's copy.
      queryClient.setQueryData<WorkoutSession>(["workoutSession", sessionId], (s) => withSetLog(s, created));
      queryClient.invalidateQueries({ queryKey: ["workoutSession", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["workoutSessions", sessionId, "summary", "live"] });
      if (warmup) {
        setPendingWarmups((ws) => ws.filter((_, i) => i !== warmupIndex));
      } else {
        setDraft(null);
        setRpe(undefined);
        setSetType("normal");
        // Supersets (Figma 03b log/03): A1 -> A2 without rest; rest after the last partner, then back to A1.
        const counts = new Map<string, number>();
        for (const l of session.setLogs) if (!l.isWarmup) counts.set(l.exerciseId, (counts.get(l.exerciseId) ?? 0) + 1);
        counts.set(currentExercise.exercise.id, workingLogged.length + 1);
        const next = afterWorkingSet(orderedExercises, exerciseIndex, (id) => counts.get(id) ?? 0);
        setShowRestTimer(next.rest);
        if (next.nextIndex !== exerciseIndex) {
          setExerciseIndex(next.nextIndex);
          updateSessionProgress(sessionId, next.nextIndex).catch(() => undefined);
        }
      }
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
        leaveWithoutPrompt(allowLeave, () => navigation.replace("WorkoutComplete", { sessionId, workoutName: workout.name }));
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
    } catch (err) {
      Alert.alert("Couldn't move to the next exercise", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsAdvancing(false);
    }
  };

  const onAbandon = () => {
    Alert.alert(
      "Discard this workout?",
      "Sets you've already logged stay saved, but this workout will be closed and won't count as completed. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard workout",
          style: "destructive",
          onPress: async () => {
            setIsAbandoning(true);
            try {
              await abandonWorkoutSession(sessionId);
              clearSwaps(workoutId);
              await queryClient.invalidateQueries({ queryKey: ["workoutHistory"] });
              leaveWithoutPrompt(allowLeave, () => exitTaskToHome(navigation, "TrainDashboard"));
            } catch (err) {
              Alert.alert("Couldn't discard workout", extractErrorMessage(err, "Check your connection and try again."));
            } finally {
              setIsAbandoning(false);
            }
          },
        },
      ],
    );
  };
  abandonRef.current = onAbandon;

  // Warm-ups don't use up the target; "+ Add set" raises it for this visit.
  const targetSets = (currentExercise?.targetSets ?? 0) + extraSets;
  const setsRemaining = currentExercise ? Math.max(0, targetSets - workingLogged.length) : 0;
  const equipment = currentExercise?.exercise.equipment ?? "";
  const defaultRest = workoutSettings?.restTimerSeconds ?? 60;
  const restSeconds = currentExercise?.restSeconds ?? defaultRest;
  const sessionExerciseId = currentExercise?.sessionExerciseId ?? null;
  const groupLabel = supersetLabel(orderedExercises, exerciseIndex);
  // Exercises this one can be linked with: any other entry not already in a superset.
  const supersetCandidates = orderedExercises
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => i !== exerciseIndex && !e.supersetGroup && !!e.sessionExerciseId);

  /**
   * Batch 3b: a change to the session's list (add, superset, remove) returns the
   * whole list; it goes into the shared session cache and the screen stays on
   * the same exercise even if its position moved.
   */
  const applyListChange = async (change: () => Promise<WorkoutSession["exercises"]>, failure: string) => {
    setListBusy(true);
    try {
      const keepId = currentExercise?.exercise.id;
      const exercises = await change();
      queryClient.setQueryData<WorkoutSession>(["workoutSession", sessionId], (s) => (s ? { ...s, exercises } : s));
      const newIndex = Math.max(0, exercises ? exercises.findIndex((e) => e.exerciseId === keepId) : exerciseIndex);
      const clamped = Math.min(newIndex === -1 ? exerciseIndex : newIndex, Math.max(0, (exercises?.length ?? 1) - 1));
      if (clamped !== exerciseIndex) {
        setExerciseIndex(clamped);
        updateSessionProgress(sessionId, clamped).catch(() => undefined);
      }
    } catch (err) {
      Alert.alert(failure, extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setListBusy(false);
    }
  };

  const onAddExercise = (exerciseId: string) => {
    setAddOpen(false);
    void applyListChange(() => addSessionExercise(sessionId, { exerciseId }), "Couldn't add that exercise");
  };

  const onSupersetWith = (partnerIndex: number) => {
    const partner = orderedExercises[partnerIndex];
    const letter = nextFreeLetter(orderedExercises);
    if (!sessionExerciseId || !partner?.sessionExerciseId || !letter) return;
    setSupersetOpen(false);
    void applyListChange(async () => {
      await updateSessionExercise(sessionId, sessionExerciseId, { supersetGroup: letter });
      // The partner moves right after this exercise, so A1 and A2 are done back to back.
      const target = partnerIndex > exerciseIndex ? exerciseIndex + 1 : exerciseIndex;
      return updateSessionExercise(sessionId, partner.sessionExerciseId as string, { supersetGroup: letter, order: target });
    }, "Couldn't link the superset");
  };

  const onRemoveFromSuperset = () => {
    if (!sessionExerciseId) return;
    void applyListChange(() => updateSessionExercise(sessionId, sessionExerciseId, { supersetGroup: null }), "Couldn't change the superset");
  };

  const onRemoveExercise = () => {
    if (!sessionExerciseId || !currentExercise) return;
    Alert.alert("Remove this exercise?", `${currentExercise.exercise.name} is taken out of this workout only. Your plan doesn't change.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          const removedIndex = exerciseIndex;
          void (async () => {
            setListBusy(true);
            try {
              const exercises = await removeSessionExercise(sessionId, sessionExerciseId);
              queryClient.setQueryData<WorkoutSession>(["workoutSession", sessionId], (s) => (s ? { ...s, exercises } : s));
              // The server keeps the user on the exercise that now sits at this position.
              setExerciseIndex(Math.min(removedIndex, Math.max(0, exercises.length - 1)));
            } catch (err) {
              Alert.alert("Couldn't remove that exercise", extractErrorMessage(err, "Check your connection and try again."));
            } finally {
              setListBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const onChooseRest = async (seconds: number | null) => {
    if (!currentExercise) return;
    setRestOpen(false);
    try {
      if (seconds == null) await clearExerciseRest(currentExercise.exercise.id);
      else await setExerciseRest(currentExercise.exercise.id, seconds);
      await queryClient.invalidateQueries({ queryKey: ["workoutSession", sessionId] });
    } catch (err) {
      Alert.alert("Couldn't save the rest time", extractErrorMessage(err, "Check your connection and try again."));
    }
  };

  const onAddWarmups = () => {
    const working = parseFloat(active.weight);
    if (!(working > 0)) {
      Alert.alert("Add a working weight first", "Warm-up sets are worked out from the weight of your first working set.");
      return;
    }
    const sets = warmUpSets(working, loadingStepKg(equipment));
    if (sets.length === 0) {
      Alert.alert("No warm-ups needed", `${formatWeight(working)} kg is too light to split into lighter warm-up sets.`);
      return;
    }
    setPendingWarmups(sets);
    setWarmupsAddedFrom(working);
  };

  const menuItems: ExerciseMenuItem[] = [
    ...(workingLogged.length === 0 && pendingWarmups.length === 0
      ? [{ key: "warmups", label: "Add warm-up sets", icon: "flame" as const, onPress: onAddWarmups }]
      : []),
    ...(currentExercise && loggedSets.length === 0
      ? [
          {
            key: "replace",
            label: "Replace exercise",
            icon: "swap" as const,
            onPress: () =>
              navigation.navigate("ExerciseSwap", {
                workoutId,
                workoutExerciseId: currentExercise.id,
                exerciseId: currentExercise.exercise.id,
                // Batch 3b: with a session list the swap is saved on the server (survives a restart).
                ...(sessionExerciseId ? { sessionId, sessionExerciseId } : {}),
              }),
          },
        ]
      : []),
    ...(sessionExerciseId && !currentExercise?.supersetGroup && supersetCandidates.length > 0
      ? [{ key: "superset", label: "Superset with…", icon: "swap" as const, onPress: () => setSupersetOpen(true) }]
      : []),
    ...(sessionExerciseId && currentExercise?.supersetGroup
      ? [{ key: "unsuperset", label: `Remove from superset ${currentExercise.supersetGroup}`, icon: "x" as const, onPress: onRemoveFromSuperset }]
      : []),
    {
      key: "notes",
      label: "Notes & set details",
      icon: "pencil",
      onPress: () => navigation.navigate("SetRestTracker", { workoutId, sessionId, exerciseIndex }),
    },
    {
      key: "rest",
      label: "Rest timer",
      icon: "clock",
      value: `${restSeconds} s`,
      // Batch 3b: with a session list the choice is saved for this exercise; otherwise it just starts the timer.
      onPress: () => (sessionExerciseId ? setRestOpen(true) : setShowRestTimer(true)),
    },
    ...(isBarbell(equipment) ? [{ key: "plates", label: "Plate calculator", icon: "sliders" as const, onPress: () => setPlatesOpen(true) }] : []),
    ...(sessionExerciseId && loggedSets.length === 0 && orderedExercises.length > 1
      ? [{ key: "remove", label: "Remove from this workout", icon: "trash" as const, onPress: onRemoveExercise }]
      : []),
  ];
  const upNext = orderedExercises.slice(exerciseIndex + 1);
  const score = readiness.data?.score ?? null;
  const context = profile.data?.equipmentContext ?? null;
  const modeTitle = context === "full_gym" ? "Gym Mode" : context ? "Home Mode" : null;
  const currentSetNumber = Math.min(workingLogged.length + 1, targetSets || 1);

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
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>
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
          <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
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
              ✦ Your recovery score is {score}/100.{readiness.data?.summary ? ` ${readiness.data.summary}` : ""}
            </Text>
            <Pressable
              onPress={() => setWhyOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Why this recovery score?"
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
              <Text style={{ color: colors.aiText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Why?</Text>
            </Pressable>
          </View>
        ) : null}

        {modeTitle ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 14 }}>{modeTitle}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Mode changes between exercises. Switching is locked while you're mid-set. Change it from the Workouts tab.
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={{ flex: 1, color: theme.accentText, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.6 }}>ACTIVE EXERCISE</Text>
            {setsRemaining > 0 ? (
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                Set {currentSetNumber} of {targetSets}
              </Text>
            ) : (
              <Text style={{ color: colors.successText, fontFamily: fonts.bodyBold, fontSize: 13 }}>All sets done</Text>
            )}
            <Pressable
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${currentExercise?.exercise.name ?? "this exercise"}`}
              hitSlop={10}
              style={{ paddingHorizontal: 4 }}
            >
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 20 }}>⋯</Text>
            </Pressable>
          </View>
          {groupLabel && currentExercise?.supersetGroup ? (
            <View style={{ alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: theme.accentSoft, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                Superset {currentExercise.supersetGroup} · {groupLabel} · rest after the last one
              </Text>
            </View>
          ) : null}
          <Pressable onLongPress={() => setMenuOpen(true)} accessibilityRole="text" delayLongPress={350}>
            <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 20 }}>{currentExercise?.exercise.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
              Rest {formatMmSs(restSeconds)}
              {equipment ? ` · ${equipment}` : ""} · {currentExercise?.targetSets} × {currentExercise?.targetReps}
            </Text>
          </Pressable>

          {warmupsAddedFrom != null && pendingWarmups.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.warning,
                backgroundColor: colors.warningSoft,
                padding: spacing.sm + 2,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.warningText, fontFamily: fonts.bodyBold, fontSize: 14 }}>
                  {pendingWarmups.length} warm-up set{pendingWarmups.length === 1 ? "" : "s"} added
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  About 40%, 65% and 85% of {formatWeight(warmupsAddedFrom)} kg. Tap a value to change it.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setPendingWarmups([]);
                  setWarmupsAddedFrom(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Undo warm-up sets"
                hitSlop={8}
                style={{ borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 13 }}>Undo</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {previousWorking.length > 0
              ? "Last time's numbers are pre-filled. Tap ✓ to log, or tap a number to change it."
              : "Tap ✓ to log, or tap a number to change it."}
          </Text>

          {/* Set table: SET · PREVIOUS · KG · REPS · ✓ */}
          <View style={{ gap: 6 }}>
            <View style={tableStyles.row}>
              <Text style={[tableStyles.head, tableStyles.setCol]}>SET</Text>
              <Text style={[tableStyles.head, tableStyles.prevCol]}>PREVIOUS</Text>
              <Text style={[tableStyles.head, tableStyles.numCol]}>KG</Text>
              <Text style={[tableStyles.head, tableStyles.numCol]}>REPS</Text>
              <Text style={[tableStyles.head, tableStyles.checkCol]}>✓</Text>
            </View>

            {loggedSets.map((s, i) => {
              const label = rowLabels[i];
              const working = /^\d+$/.test(label) ? previousFor(parseInt(label, 10)) : undefined;
              const isPr = s.id === prSetId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setEditingSet(session?.setLogs.find((l) => l.id === s.id) ?? null)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label === "W" ? "Warm-up" : label === "D" ? "Drop set" : `Set ${label}`}, ${formatSetValues(s)}, logged${isPr ? ", personal best" : ""}. Edit`}
                  style={[tableStyles.row, { borderRadius: radius.sm, backgroundColor: colors.successSoft, paddingVertical: 4 }]}
                >
                  <Text style={[tableStyles.label, tableStyles.setCol, label === "W" ? { color: colors.warningText } : label === "D" ? { color: colors.aiText } : null]}>
                    {label}
                  </Text>
                  <Text style={[tableStyles.prev, tableStyles.prevCol]} numberOfLines={1}>
                    {formatSetValues(working)}
                  </Text>
                  <Text style={[tableStyles.value, tableStyles.numCol]}>{s.weightKg != null ? formatWeight(s.weightKg) : "—"}</Text>
                  <Text style={[tableStyles.value, tableStyles.numCol]}>{s.reps}</Text>
                  <View style={[tableStyles.checkCol, { alignItems: "center" }]}>
                    {isPr ? (
                      <Icon name="trophy" size={18} color={colors.warning} />
                    ) : (
                      <Icon name="check" size={18} color={colors.successText} strokeWidth={3} />
                    )}
                  </View>
                </Pressable>
              );
            })}

            {pendingWarmups.map((w, i) => (
              <View key={`warmup-${i}`} style={tableStyles.row}>
                <Text style={[tableStyles.label, tableStyles.setCol, { color: colors.warningText }]}>W</Text>
                <Text style={[tableStyles.prev, tableStyles.prevCol]}>—</Text>
                <Pressable
                  onPress={() => setQuickEdit({ kind: "warmup", index: i })}
                  accessibilityRole="button"
                  accessibilityLabel={`Warm-up weight ${w.weightKg ?? "none"} kilograms. Change`}
                  style={[tableStyles.cell, tableStyles.numCol]}
                >
                  <Text style={tableStyles.value}>{w.weightKg != null ? formatWeight(w.weightKg) : "—"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setQuickEdit({ kind: "warmup", index: i })}
                  accessibilityRole="button"
                  accessibilityLabel={`Warm-up reps ${w.reps}. Change`}
                  style={[tableStyles.cell, tableStyles.numCol]}
                >
                  <Text style={tableStyles.value}>{w.reps}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onLogSet(i)}
                  disabled={paused || isSubmittingSet || !hasHydrated}
                  accessibilityRole="button"
                  accessibilityLabel={`Log warm-up set, ${formatSetValues(w)}`}
                  style={[tableStyles.checkButton, tableStyles.checkCol, { opacity: paused || !hasHydrated ? 0.4 : 1 }]}
                >
                  <Icon name="check" size={18} color={colors.textPrimary} strokeWidth={3} />
                </Pressable>
              </View>
            ))}

            {setsRemaining > 0 ? (
              <View style={tableStyles.row}>
                <Text style={[tableStyles.label, tableStyles.setCol, setType !== "normal" ? { color: colors.aiText } : null]}>
                  {setType === "drop" ? "D" : setType === "failure" ? "F" : nextWorkingNumber}
                </Text>
                <Text style={[tableStyles.prev, tableStyles.prevCol]} numberOfLines={1}>
                  {formatSetValues(lastTime)}
                </Text>
                <Pressable
                  onPress={() => setQuickEdit({ kind: "active" })}
                  accessibilityRole="button"
                  accessibilityLabel={`Weight ${active.weight || "none"} kilograms. Change`}
                  style={[tableStyles.cell, tableStyles.numCol, { borderColor: theme.accent }]}
                >
                  <Text style={tableStyles.value}>{active.weight || "—"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setQuickEdit({ kind: "active" })}
                  accessibilityRole="button"
                  accessibilityLabel={`Reps ${active.reps || "none"}. Change`}
                  style={[tableStyles.cell, tableStyles.numCol, { borderColor: theme.accent }]}
                >
                  <Text style={tableStyles.value}>{active.reps || "—"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onLogSet()}
                  disabled={!(activeReps > 0) || paused || isSubmittingSet || !hasHydrated}
                  accessibilityRole="button"
                  accessibilityLabel={`Log set ${nextWorkingNumber}`}
                  style={[
                    tableStyles.checkButton,
                    tableStyles.checkCol,
                    { backgroundColor: theme.accent, opacity: !(activeReps > 0) || paused || !hasHydrated ? 0.4 : 1 },
                  ]}
                >
                  {isSubmittingSet ? (
                    <ActivityIndicator color={theme.textOnAccent} />
                  ) : (
                    <Icon name="check" size={18} color={theme.textOnAccent} strokeWidth={3} />
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>

          {setsRemaining > 0 && rpe ? (
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>
              RPE {rpe} — {rpeLabel(rpe)}
            </Text>
          ) : null}

          <Pressable
            onPress={() => setExtraSets((n) => n + 1)}
            accessibilityRole="button"
            accessibilityLabel="Add set"
            style={{ height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>+ Add set</Text>
          </Pressable>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>W warm-up · 1–{currentExercise?.targetSets} working · D drop set · F to failure</Text>
        </View>

        {showRestTimer ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <RestTimer key={`${exerciseIndex}-${loggedSets.length}`} layout="compact" defaultSeconds={restSeconds} onDismiss={() => setShowRestTimer(false)} />
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
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                    {ex.targetSets} Sets · {ex.targetReps} Reps
                  </Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {/* Batch 3b: "+ Add exercise" (Figma 03b log/01) — only with a session list to add to. */}
        {session?.exercises && session.exercises.length > 0 && session.exercises[0].id ? (
          <Pressable
            onPress={() => setAddOpen(true)}
            disabled={listBusy}
            accessibilityRole="button"
            accessibilityLabel="Add exercise"
            style={{
              height: 48,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: theme.accent,
              backgroundColor: theme.accentSoft,
              alignItems: "center",
              justifyContent: "center",
              opacity: listBusy ? 0.5 : 1,
            }}
          >
            <Text style={{ color: theme.accentText, ...typography.label, fontSize: 15 }}>+ Add exercise</Text>
          </Pressable>
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
        title="Why this recovery score?"
        heading="Based on your own logs"
        rationale={readiness.data?.summary ?? readiness.data?.headline ?? "Computed from the recovery data you have logged."}
        rows={(readiness.data?.components ?? []).map((c) => ({ label: readinessFactorLabel(c.key), value: `${Math.round(c.score)}/100` }))}
        caveat={readiness.data?.basis ?? "Based on your logged data"}
      />

      <SetQuickEditSheet
        visible={quickEdit !== null}
        title={
          quickEdit?.kind === "warmup"
            ? `Warm-up · ${currentExercise?.exercise.name ?? ""}`
            : `Set ${nextWorkingNumber} · ${currentExercise?.exercise.name ?? ""}`
        }
        value={
          quickEdit?.kind === "warmup" && pendingWarmups[quickEdit.index]
            ? {
                weight: pendingWarmups[quickEdit.index].weightKg != null ? formatWeight(pendingWarmups[quickEdit.index].weightKg as number) : "",
                reps: String(pendingWarmups[quickEdit.index].reps),
              }
            : { ...active, rpe }
        }
        lastSet={quickEdit?.kind === "active" && lastWorking ? { weightKg: lastWorking.weightKg, reps: lastWorking.reps } : undefined}
        lastTime={quickEdit?.kind === "active" ? lastTime : undefined}
        showRpe={quickEdit?.kind === "active"}
        setType={quickEdit?.kind === "active" ? setType : undefined}
        onDone={(v) => {
          if (quickEdit?.kind === "warmup") {
            const index = quickEdit.index;
            const next = { weightKg: v.weight ? parseFloat(v.weight) : undefined, reps: parseInt(v.reps, 10) };
            setPendingWarmups((ws) => ws.map((w, i) => (i === index ? next : w)));
          } else {
            setDraft({ weight: v.weight, reps: v.reps });
            setRpe(v.rpe);
            if (v.setType) setSetType(v.setType);
          }
          setQuickEdit(null);
        }}
        onClose={() => setQuickEdit(null)}
      />
      <ExerciseMenuSheet
        visible={menuOpen}
        title={currentExercise?.exercise.name ?? "Exercise"}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      <ExerciseMenuSheet
        visible={supersetOpen}
        title="Superset with…"
        items={supersetCandidates.map(({ e, i }) => ({
          key: e.exercise.id,
          label: e.exercise.name,
          icon: "dumbbell" as const,
          value: i > exerciseIndex ? "Later" : "Earlier",
          onPress: () => onSupersetWith(i),
        }))}
        footnote="Do both back to back, then rest. The other exercise moves right after this one."
        onClose={() => setSupersetOpen(false)}
      />
      <ExerciseMenuSheet
        visible={restOpen}
        title={`Rest for ${currentExercise?.exercise.name ?? "this exercise"}`}
        items={[
          ...REST_CHOICES.map((sec) => ({
            key: String(sec),
            label: formatMmSs(sec),
            icon: (sec === restSeconds ? "check" : "clock") as "check" | "clock",
            onPress: () => void onChooseRest(sec),
          })),
          { key: "default", label: `Use my default (${formatMmSs(defaultRest)})`, icon: "refresh-cw" as const, onPress: () => void onChooseRest(null) },
        ]}
        footnote="Saved for this exercise in every workout."
        onClose={() => setRestOpen(false)}
      />
      <AddExerciseSheet
        visible={addOpen}
        exercises={exerciseLibrary.data}
        loading={exerciseLibrary.isLoading}
        excludeIds={orderedExercises.map((e) => e.exercise.id)}
        onPick={onAddExercise}
        onClose={() => setAddOpen(false)}
      />
      <PlateCalculatorSheet
        visible={platesOpen}
        initialKg={parseFloat(active.weight) || undefined}
        onUse={(kg) => setDraft({ weight: formatWeight(kg), reps: active.reps })}
        onClose={() => setPlatesOpen(false)}
      />
      <SetEditSheet
        sessionId={sessionId}
        set={editingSet}
        title={editingSet?.isWarmup ? "Edit warm-up set" : "Edit set"}
        onClose={() => {
          setEditingSet(null);
          queryClient.invalidateQueries({ queryKey: ["workoutSessions", sessionId, "summary", "live"] });
        }}
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

/** Set table columns (Figma log/01): SET · PREVIOUS · KG · REPS · ✓. */
const tableStyles = themed(() => ({
  row: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 },
  head: { color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 0.4 },
  setCol: { width: 30, textAlign: "center" },
  prevCol: { flex: 1 },
  numCol: { width: 64, textAlign: "center" },
  checkCol: { width: 40, textAlign: "center" },
  label: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 15 },
  prev: { color: colors.textSecondary, fontSize: 13 },
  value: { color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 15, textAlign: "center" },
  cell: {
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  checkButton: {
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
} as const));
