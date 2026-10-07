import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { EquipmentContext } from "@fitness-ai-app/types";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchGymTodayWorkout, GYM_TODAY_KEY } from "../../api/gym";
import { editOnboardingProfile } from "../../api/users";
import { startWorkoutSession } from "../../api/workoutSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { setSwap, useSwaps } from "../../lib/exerciseSwaps";
import { fmtGymDate } from "../../lib/gymFormat";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { TrainStackParamList } from "../../navigation/TrainStack";
import { RecoverShell } from "../recover/parts";

type Props = NativeStackScreenProps<TrainStackParamList, "GymWorkout">;

const PHASE_ORDER_LABEL = { warmup: "Warm-up", main: "", cooldown: "Cool-down" } as const;

/**
 * Today's gym workout (Figma My Gym 03). The next planned workout checked
 * against the gym's equipment list (GET /gym/workout/today). Unavailable machines
 * are flagged with a real suggested swap that can be applied to this workout
 * (client-side, lib/exerciseSwaps.ts), or the user can pick another.
 */
export function GymWorkoutScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: GYM_TODAY_KEY, queryFn: fetchGymTodayWorkout, retry: false });
  const data = q.data;
  const workoutId = data?.workout?.id ?? "";
  const swaps = useSwaps(workoutId);
  const [whyOpen, setWhyOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const notLinked = q.isError && isAxiosError(q.error) && q.error.response?.status === 404;

  const isGym = data?.equipmentContext === "full_gym";
  const setContext = useMutation({
    mutationFn: (equipmentContext: EquipmentContext) => editOnboardingProfile({ equipmentContext }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboardingProfile"] });
      queryClient.invalidateQueries({ queryKey: GYM_TODAY_KEY });
    },
    onError: (err) => Alert.alert("Couldn't change training location", extractErrorMessage(err, "Try again in a moment.")),
  });

  // The first suggestion the user has not applied yet.
  const pending = (data?.swapSuggestions ?? []).find((s) => !swaps[s.workoutExerciseId]);

  const onStart = async () => {
    if (!data?.workout) return;
    setStarting(true);
    try {
      const session = await startWorkoutSession(data.workout.id);
      navigation.navigate("ActiveWorkout", { workoutId: data.workout.id, sessionId: session.id });
    } catch (err) {
      Alert.alert("Couldn't start workout", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setStarting(false);
    }
  };

  const card = { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border } as const;

  return (
    <RecoverShell centered title="Today's gym workout" onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <SkeletonCard lines={5} />
      ) : notLinked ? (
        <View style={{ ...card, padding: spacing.md, gap: 4 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>No gym linked</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>Link a partner gym from Profile to see a workout built for its equipment.</Text>
        </View>
      ) : q.isError || !data ? (
        <ErrorState message="Couldn't load your gym workout." onRetry={() => q.refetch()} />
      ) : !data.workout ? (
        <View style={{ ...card, padding: spacing.md, gap: 6 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
            {data.emptyReason === "program_complete" ? "Program complete" : "No workout planned yet"}
          </Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 18 }}>
            {data.emptyReason === "program_complete"
              ? "You have finished every workout in your current plan. Pick a new program to get your next gym workout."
              : "Pick a program or generate a plan and your next workout will be checked against this gym's equipment here."}
          </Text>
          <Button label="Browse programs" variant="secondary" onPress={() => navigation.navigate("ProgramsMarketplace")} style={{ marginTop: spacing.sm }} />
        </View>
      ) : (
        <>
          <View style={{ ...card, padding: 14, gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>{data.workout.name}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>
              {data.workout.durationMinutes} min · {data.workout.mainCount} exercises
              {data.workout.otherCount > 0 ? ` + ${data.workout.otherCount} warm-up/cool-down` : ""} · built for {data.gym.name} equipment
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
              <View style={{ borderRadius: radius.pill, backgroundColor: isGym ? theme.accent : colors.surfaceHigh, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: isGym ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
                  Gym{data.gym.locationName ? `: ${data.gym.locationName}` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => setContext.mutate(isGym ? "home_dumbbells_bands" : "full_gym")}
                disabled={setContext.isPending}
                accessibilityRole="button"
                accessibilityLabel={isGym ? "Switch to Home" : "Switch to Gym"}
                style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{isGym ? "Switch to Home" : "Switch to Gym"}</Text>
              </Pressable>
            </View>
          </View>

          {pending ? (
            <View style={{ backgroundColor: colors.warningSoft, borderRadius: radius.card, borderWidth: 1, borderColor: colors.warning, padding: 14, gap: spacing.sm }}>
              <Text style={{ color: colors.warning, fontFamily: fonts.bodyBold, fontSize: 12 }}>Suggested swap for this gym</Text>
              <Text style={{ color: colors.textPrimary, ...typography.meta, lineHeight: 19 }}>
                The {pending.unavailableEquipmentName.toLowerCase()} was marked unavailable on {fmtGymDate(pending.updatedAt)}. Swap {pending.from.name} for{" "}
                {pending.to.name}
                {pending.toEquipmentLabel ? ` on the ${pending.toEquipmentLabel.toLowerCase()}` : ""}.
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                <Button
                  label="Apply change"
                  onPress={() => setSwap(data.workout!.id, pending.workoutExerciseId, pending.to)}
                  style={{ height: 38, paddingHorizontal: 14 }}
                />
                <Button
                  label="Choose another swap"
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate("ExerciseSwap", {
                      workoutId: data.workout!.id,
                      workoutExerciseId: pending.workoutExerciseId,
                      exerciseId: pending.from.id,
                    })
                  }
                  style={{ height: 38, paddingHorizontal: 14 }}
                />
                <Button label="Why?" variant="secondary" onPress={() => setWhyOpen(true)} style={{ height: 38, paddingHorizontal: 14 }} />
              </View>
            </View>
          ) : null}

          <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 15 }}>Exercises and where to do them</Text>
          <View style={{ ...card, overflow: "hidden" }}>
            {data.exercises.map((e, i) => {
              const swapped = swaps[e.workoutExerciseId];
              const flagged = e.gymUnavailable && !swapped;
              const suggestion = data.swapSuggestions.find((s) => s.workoutExerciseId === e.workoutExerciseId);
              const where = swapped ? (suggestion?.to.id === swapped.id ? suggestion.toEquipmentLabel : null) : e.equipmentLabel;
              return (
                <View
                  key={e.workoutExerciseId}
                  style={{
                    padding: 14,
                    gap: 2,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                    backgroundColor: flagged ? colors.warningSoft : "transparent",
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
                    <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>
                      {swapped ? swapped.name : e.name}
                    </Text>
                    {flagged ? <Text style={{ color: colors.warning, fontFamily: fonts.bodyBold, fontSize: 11 }}>swap suggested</Text> : null}
                    {swapped ? <Text style={{ color: colors.success, fontFamily: fonts.bodyBold, fontSize: 11 }}>swapped</Text> : null}
                  </View>
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>
                    {PHASE_ORDER_LABEL[e.phase] ? `${PHASE_ORDER_LABEL[e.phase]} · ` : ""}
                    {e.sets}×{e.reps}
                    {e.lastWeightKg != null && !swapped ? ` · ${e.lastWeightKg} kg` : ""} · {where ?? (swapped ? swapped.equipment : e.equipment)}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 17 }}>
            Workouts are planned only with equipment your gym has marked available. If the gym changes its list, suggestions here update.
          </Text>

          <Button label="Start workout" onPress={onStart} loading={starting} />

          {pending ? (
            <ReasoningSheet
              visible={whyOpen}
              onClose={() => setWhyOpen(false)}
              title="Why this swap?"
              heading="Based on your gym's equipment list"
              rationale={`${pending.reason} ${pending.to.name} works the same muscle group (${pending.to.muscleGroup}) with equipment this gym has available.`}
              rows={[
                { label: "Unavailable", value: pending.unavailableEquipmentName },
                { label: "Marked on", value: fmtGymDate(pending.updatedAt) },
                { label: "Swap to", value: pending.to.name },
              ]}
              caveat="Equipment status is entered by your gym and may be out of date. Check with staff if unsure."
            />
          ) : null}
        </>
      )}
    </RecoverShell>
  );
}
