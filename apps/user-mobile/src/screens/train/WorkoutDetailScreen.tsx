import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { RazorpayCheckoutModal } from "../../components/RazorpayCheckoutModal";
import { fetchWorkoutDetail } from "../../api/programs";
import { startWorkoutSession } from "../../api/workoutSessions";
import { useRazorpayPurchase, usePaymentsConfigured } from "../../lib/useRazorpayPurchase";
import { extractErrorMessage } from "../../lib/apiError";
import { applySwaps, useSwaps } from "../../lib/exerciseSwaps";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "WorkoutDetail">;

const PHASE_LABELS = { warmup: "Warm-Up", main: "Strength Training", cooldown: "Cooldown & Stretch" } as const;
const PHASE_META: Record<keyof typeof PHASE_LABELS, { icon: IconName; color: string }> = {
  warmup: { icon: "flame", color: colors.orange },
  main: { icon: "dumbbell", color: colors.accent },
  cooldown: { icon: "moon", color: colors.cyan },
};

/**
 * Workout Detail (trn-04) — docs/mobile/03-screen-inventory.md §C: "summary,
 * an AI note, and accordion-style exercise phases; leads into Active
 * Workout." Phase 1 scope: the phase-grouped exercise list + Start Workout.
 * No AI note (depends on Phase 2 AI backends) and no accordion collapse —
 * a flat grouped list instead, functionally equivalent. Phase 3 addition
 * (§I Programs Commerce): if the parent program is priced and not yet
 * purchased, "Start Workout" is replaced with a Purchase button — the
 * server enforces this too (POST /workouts/:id/sessions 402s), this is
 * just the friendlier client-side version of that same gate. **20 Aug
 * 2026:** the Purchase button now routes through a real Razorpay order +
 * hosted Checkout + server-side signature verification, same as Program
 * Detail's own Purchase card — see gap §14.
 */
export function WorkoutDetailScreen({ route, navigation }: Props) {
  const { workoutId } = route.params;
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);
  const { data: workout, isLoading, isError, refetch } = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: () => fetchWorkoutDetail(workoutId),
  });
  const swaps = useSwaps(workoutId);

  const { order, purchase, isPurchasing, onCheckoutSuccess, onCheckoutDismiss } = useRazorpayPurchase({
    onVerified: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workout", workoutId] }),
        queryClient.invalidateQueries({ queryKey: ["program", workout?.program.id] }),
        queryClient.invalidateQueries({ queryKey: ["programs", "mine"] }),
      ]),
  });

  const onStart = async () => {
    setIsStarting(true);
    try {
      const session = await startWorkoutSession(workoutId);
      navigation.navigate("ActiveWorkout", { workoutId, sessionId: session.id });
    } catch (err) {
      Alert.alert("Couldn't start workout", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsStarting(false);
    }
  };

  // useRazorpayPurchase's purchase() handles its own errors internally
  // (shows its own Alert on failure), so there's no try/catch needed here.
  const onPurchase = () => workout && purchase("program_purchase", workout.program.id);
  const { configured: paymentsConfigured } = usePaymentsConfigured();

  if (isError) {
    return (
      <ScreenContainer title="Workout">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !workout) {
    return (
      <ScreenContainer title="Workout">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const phases: Array<keyof typeof PHASE_LABELS> = ["warmup", "main", "cooldown"];

  return (
    <ScreenContainer title={workout.name}>
      <Card style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <Pill label={`${workout.durationMinutes} min`} icon="clock" />
        <Pill label={`${workout.intensity} intensity`} tone="accent" />
        <Pill label={`${workout.exercises.length} exercises`} icon="dumbbell" />
      </Card>

      {phases.map((phase) => {
        const exercisesInPhase = applySwaps(workout.exercises, swaps).filter((we) => we.phase === phase);
        if (exercisesInPhase.length === 0) return null;
        const meta = PHASE_META[phase];
        return (
          <View key={phase} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Icon name={meta.icon} size={18} color={meta.color} />
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{PHASE_LABELS[phase]}</Text>
            </View>
            <Card style={{ gap: 0 }}>
              {exercisesInPhase.map((we, i) => (
                <View
                  key={we.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: spacing.sm,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, ...typography.body, flex: 1 }}>{we.exercise.name}</Text>
                  <Pressable
                    onPress={() =>
                      navigation.navigate("ExerciseSwap", {
                        workoutId,
                        workoutExerciseId: we.id,
                        exerciseId: we.exercise.id,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Swap ${we.exercise.name}`}
                    hitSlop={6}
                    style={{ marginRight: spacing.sm }}
                  >
                    <Text style={{ color: colors.accent, ...typography.label }}>Swap</Text>
                  </Pressable>
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 3,
                      borderRadius: radius.sm,
                      backgroundColor: colors.surfaceHigh,
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, ...typography.label }}>
                      {we.targetSets} × {we.targetReps}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        );
      })}

      {workout.program.purchased ? (
        <Button label="Start Workout" onPress={onStart} loading={isStarting} style={{ marginTop: spacing.sm }} />
      ) : (
        <Button
          label={
            paymentsConfigured
              ? `Purchase ${workout.program.name} — ₹${(workout.program.priceCents / 100).toFixed(2)}`
              : "Coming soon"
          }
          onPress={onPurchase}
          loading={isPurchasing}
          disabled={!paymentsConfigured}
          style={{ marginTop: spacing.sm }}
        />
      )}

      <RazorpayCheckoutModal order={order} onSuccess={onCheckoutSuccess} onDismiss={onCheckoutDismiss} />
    </ScreenContainer>
  );
}
