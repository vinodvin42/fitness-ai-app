import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExerciseSetLog } from "@fitness-ai-app/types";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { RestTimer } from "../../components/RestTimer";
import { SetEditSheet } from "../../components/SetEditSheet";
import { displayToKg, kgToDisplay, useWorkoutSettings } from "../../api/workoutSettings";
import { fetchWorkoutDetail } from "../../api/programs";
import { fetchWorkoutSession, logWorkoutSet } from "../../api/workoutSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { sortExercisesByPhase } from "../../lib/workoutExercises";
import { applySwaps, useSwaps } from "../../lib/exerciseSwaps";
import { useTheme } from "../../theme/ThemeProvider";
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
  const { colors: theme } = useTheme();
  const { data: workoutSettings } = useWorkoutSettings();
  const weightUnit = workoutSettings?.weightUnit ?? "kg";
  const [editingSet, setEditingSet] = useState<ExerciseSetLog | null>(null);

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

  const swaps = useSwaps(workoutId);
  const currentExercise = useMemo(() => {
    if (!workout) return undefined;
    return sortExercisesByPhase(applySwaps(workout.exercises, swaps))[exerciseIndex];
  }, [workout, exerciseIndex, swaps]);

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

  // Prefill from the previous set of this exercise so a repeat set is one tap.
  const lastLogged = exerciseSetLogs.length > 0 ? exerciseSetLogs[exerciseSetLogs.length - 1] : undefined;
  useEffect(() => {
    if (!lastLogged) return;
    setReps((r) => (r === "" ? String(lastLogged.reps) : r));
    setWeight((w) => (w === "" && lastLogged.weightKg != null ? String(kgToDisplay(lastLogged.weightKg, weightUnit)) : w));
  }, [lastLogged?.id, weightUnit]);

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
        weightKg: weight ? displayToKg(parseFloat(weight), weightUnit) : undefined,
        rpe,
        isWarmup,
        isDropSet,
        note: note.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["workoutSession", sessionId] });
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

  const lastSet = exerciseSetLogs.length > 0 ? exerciseSetLogs[exerciseSetLogs.length - 1] : undefined;
  const currentSetNumber = exerciseSetLogs.length + 1;
  const totalSets = currentExercise.targetSets;
  const rpeColor = (n: number) => (n <= 4 ? colors.success : n <= 7 ? theme.accent : colors.danger);
  const rpeBg = (n: number) => (n <= 4 ? colors.successSoft : n <= 7 ? theme.accentSoft : colors.dangerSoft);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back to workout"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="arrow-left" size={18} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 20 }} numberOfLines={1}>
              {currentExercise.exercise.name}
            </Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              Set {Math.min(currentSetNumber, totalSets)} of {totalSets}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {[
            { label: `WEIGHT`, unit: weightUnit, value: weight, set: setWeight, pad: "decimal-pad" as const, last: lastSet?.weightKg != null ? `Last set: ${kgToDisplay(lastSet.weightKg, weightUnit)} ${weightUnit}` : null },
            { label: "REPS", unit: "", value: reps, set: setReps, pad: "number-pad" as const, last: lastSet ? `Last set: ${lastSet.reps} reps` : null },
          ].map((f) => (
            <View
              key={f.label}
              style={{
                flex: 1,
                alignItems: "center",
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                borderWidth: 1,
                borderColor: colors.border,
                paddingVertical: spacing.md,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 11, letterSpacing: 0.6 }}>{f.label}</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                <TextInput
                  style={{ color: colors.textPrimary, fontSize: 38, fontFamily: fonts.display, textAlign: "center", minWidth: 70, padding: 0, marginVertical: 4 }}
                  placeholder="—"
                  placeholderTextColor={colors.textMuted}
                  keyboardType={f.pad}
                  value={f.value}
                  onChangeText={f.set}
                  accessibilityLabel={f.label === "REPS" ? "Reps" : `Weight in ${weightUnit}`}
                />
                {f.unit ? <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{f.unit}</Text> : null}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{f.last ?? " "}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {[
            { label: "Warm-up Set", on: isWarmup, toggle: () => setIsWarmup((v) => !v) },
            { label: "Drop Set / Failure", on: isDropSet, toggle: () => setIsDropSet((v) => !v) },
          ].map((t) => (
            <Pressable
              key={t.label}
              onPress={t.toggle}
              accessibilityRole="switch"
              accessibilityState={{ checked: t.on }}
              accessibilityLabel={t.label}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: t.on ? theme.accent : colors.border,
                padding: spacing.md,
              }}
            >
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.on ? theme.accent : colors.surfaceHigh }} />
              <Text style={{ color: t.on ? colors.textPrimary : colors.textSecondary, fontSize: 12 }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 13 }}>Select RPE (Rating of Perceived Exertion)</Text>
        <View style={{ flexDirection: "row", gap: 5 }}>
          {RPE_SCALE.map((n) => {
            const selected = rpe === n;
            return (
              <Pressable
                key={n}
                onPress={() => setRpe(selected ? undefined : n)}
                accessibilityRole="button"
                accessibilityLabel={`RPE ${n} of 10`}
                accessibilityState={{ selected }}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? rpeColor(n) : rpeBg(n),
                }}
              >
                <Text style={{ color: selected ? "#0B0B0F" : rpeColor(n), fontFamily: fonts.bodyBold, fontSize: 12 }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>

        <RestTimer
          key={`${timerKey}-${workoutSettings?.restTimerSeconds ?? 0}`}
          autoStart={timerKey > 0}
          defaultSeconds={90}
        />

        <Text style={{ color: colors.textMuted, ...typography.meta }}>Set Note</Text>
        <TextInput
          style={{
            color: colors.textPrimary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            padding: spacing.md,
            minHeight: 48,
          }}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={280}
          value={note}
          onChangeText={setNote}
          accessibilityLabel="Set note"
        />

        <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 13 }}>Set History (Today)</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          {exerciseSetLogs.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>No sets logged for this exercise yet.</Text>
          ) : (
            <>
              <View style={{ flexDirection: "row", paddingBottom: 6 }}>
                {["SET", "WEIGHT", "REPS", "RPE", ""].map((h, i) => (
                  <Text key={i} style={{ flex: i === 4 ? 0.6 : 1, color: colors.textMuted, fontSize: 10 }}>
                    {h}
                  </Text>
                ))}
              </View>
              {exerciseSetLogs.map((s) => (
                <View key={s.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                  <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }}>{s.setNumber}</Text>
                  <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 12 }}>
                    {s.weightKg != null ? `${kgToDisplay(s.weightKg, weightUnit)} ${weightUnit}` : "—"}
                  </Text>
                  <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 12 }}>{s.reps}</Text>
                  <Text style={{ flex: 1, color: s.rpe ? rpeColor(s.rpe) : colors.textMuted, fontSize: 12 }}>{s.rpe ? `RPE ${s.rpe}` : "—"}</Text>
                  <Pressable
                    onPress={() => setEditingSet(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit set ${s.setNumber}`}
                    hitSlop={8}
                    style={{ flex: 0.6 }}
                  >
                    <Text style={{ color: theme.accent, fontSize: 12 }}>Edit</Text>
                  </Pressable>
                </View>
              ))}
              {exerciseSetLogs.some((s) => s.isWarmup || s.isDropSet || s.note) ? (
                <View style={{ marginTop: 6, gap: 2 }}>
                  {exerciseSetLogs
                    .filter((s) => s.isWarmup || s.isDropSet || s.note)
                    .map((s) => (
                      <Text key={s.id} style={{ color: colors.textMuted, fontSize: 11 }}>
                        Set {s.setNumber}: {[s.isWarmup ? "warm-up" : null, s.isDropSet ? "drop set" : null].filter(Boolean).join(", ")}
                        {s.note ? `${s.isWarmup || s.isDropSet ? " · " : ""}“${s.note}”` : ""}
                      </Text>
                    ))}
                </View>
              ) : null}
            </>
          )}
        </View>

        <Button label="Log Set & Start Rest" onPress={onLogSet} loading={isSubmitting} disabled={!reps} />
      </ScrollView>
      <SetEditSheet sessionId={sessionId} set={editingSet} onClose={() => setEditingSet(null)} />
    </SafeAreaView>
  );
}
