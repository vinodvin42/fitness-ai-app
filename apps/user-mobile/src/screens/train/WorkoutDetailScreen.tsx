import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { RazorpayCheckoutModal } from "../../components/RazorpayCheckoutModal";
import { fetchWorkoutDetail } from "../../api/programs";
import { fetchReadiness } from "../../api/recovery";
import { startWorkoutSession } from "../../api/workoutSessions";
import { useRazorpayPurchase, usePaymentsConfigured } from "../../lib/useRazorpayPurchase";
import { extractErrorMessage } from "../../lib/apiError";
import { applySwaps, useSwaps } from "../../lib/exerciseSwaps";
import { BRAND_NAME } from "../../lib/brand";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "WorkoutDetail">;

const PHASE_LABELS = { warmup: "Mobility & Warm-up", main: "Strength Training", cooldown: "Cooldown & Stretch" } as const;
const PHASE_META: Record<keyof typeof PHASE_LABELS, { color: string }> = {
  warmup: { color: colors.success },
  main: { color: colors.accent },
  cooldown: { color: colors.aiAccent },
};
const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;

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
  const { colors: theme } = useTheme();
  const [isStarting, setIsStarting] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const readiness = useQuery({ queryKey: ["readiness"], queryFn: fetchReadiness });
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
  const allExercises = applySwaps(workout.exercises, swaps);
  const score = readiness.data?.score ?? null;

  return (
    <ScreenContainer title={workout.name}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: -spacing.sm }}>
        {workout.durationMinutes} min · {workout.exercises.length} exercises · {LEVEL_LABEL[workout.intensity]}
      </Text>

      {score != null && readiness.data ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ alignSelf: "flex-start", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.aiBorder, backgroundColor: colors.aiSurface, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 0.6 }}>
              ✦ {BRAND_NAME.toUpperCase()} READINESS
            </Text>
          </View>
          <View style={{ backgroundColor: colors.aiSurface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.aiBorder, padding: spacing.md, gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 19 }}>
              Your readiness is {score}/100.{readiness.data.summary ? ` ${readiness.data.summary}` : ""}
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
        </View>
      ) : null}

      {phases.map((phase) => {
        const exercisesInPhase = allExercises.filter((we) => we.phase === phase);
        if (exercisesInPhase.length === 0) return null;
        const meta = PHASE_META[phase];
        const isOpen = expanded[phase] ?? phase === "main";
        return (
          <View
            key={phase}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: isOpen ? theme.accent : colors.border,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => setExpanded((e) => ({ ...e, [phase]: !isOpen }))}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${PHASE_LABELS[phase]}, ${exercisesInPhase.length} exercises`}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.color }} />
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 14 }}>{PHASE_LABELS[phase]}</Text>
              <Text style={{ flex: 1, color: colors.textMuted, fontSize: 12 }}>· {exercisesInPhase.length} ex</Text>
              <View style={{ transform: [{ rotate: isOpen ? "-90deg" : "90deg" }] }}>
                <Icon name="chevron-right" size={16} color={isOpen ? theme.accent : colors.textMuted} />
              </View>
            </Pressable>
            {isOpen ? (
              <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
                {exercisesInPhase.map((we) => (
                  <View
                    key={we.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      paddingVertical: spacing.sm,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Pressable
                      onPress={() => navigation.navigate("ExerciseDetail", { exerciseId: we.exercise.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`${we.exercise.name} details`}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md }}
                    >
                      {we.exercise.mediaUrl ? (
                        <Image source={{ uri: we.exercise.mediaUrl }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceRaised }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                          <Icon name="dumbbell" size={18} color={colors.textMuted} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{we.exercise.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                          {we.targetSets}×{we.targetReps} · {we.exercise.muscleGroup}
                        </Text>
                      </View>
                    </Pressable>
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
                      hitSlop={8}
                    >
                      <Icon name="swap" size={18} color={theme.accent} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {workout.program.purchased ? (
        <>
          <Button label="Start Workout" onPress={onStart} loading={isStarting} style={{ marginTop: spacing.sm }} />
        </>
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

      <ReasoningSheet
        visible={whyOpen}
        onClose={() => setWhyOpen(false)}
        title="Why this readiness?"
        heading="Based on your own logs"
        rationale={readiness.data?.summary ?? readiness.data?.headline ?? "Computed from the recovery data you have logged."}
        rows={(readiness.data?.components ?? []).map((c) => ({ label: c.key, value: `${Math.round(c.score)}/100` }))}
        caveat={readiness.data?.basis ?? "Based on your logged data"}
      />

      <RazorpayCheckoutModal order={order} onSuccess={onCheckoutSuccess} onDismiss={onCheckoutDismiss} />
    </ScreenContainer>
  );
}
