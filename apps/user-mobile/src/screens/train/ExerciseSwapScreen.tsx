import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Exercise, WorkoutSession } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { fetchExerciseDetail } from "../../api/programs";
import { updateSessionExercise } from "../../api/workoutSessions";
import { extractErrorMessage } from "../../lib/apiError";
import { useToast } from "../../components/Toast";
import { setSwap } from "../../lib/exerciseSwaps";
import { matchPercent, rankAlternatives, swapReasonCopy, type SwapReason } from "../../lib/exerciseMatch";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ExerciseSwap">;

const ALL = "All";
const REASONS: Array<{ value: SwapReason; label: string }> = [
  { value: "equipment_busy", label: "Equipment Busy" },
  { value: "joint_pain", label: "Joint Pain" },
  { value: "preference", label: "Preference" },
  { value: "home", label: "Home Friendly" },
];

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function Thumb({ exercise }: { exercise: Exercise }) {
  return exercise.mediaUrl ? (
    <Image source={{ uri: exercise.mediaUrl }} style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh }} />
  ) : (
    <View
      style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="dumbbell" size={18} color={colors.textMuted} />
    </View>
  );
}

/**
 * Exercise Swap (Figma Train 09). Alternatives are the real
 * GET /exercises/:id `alternatives` (same muscle group). Swapping applies to
 * this workout client-side only (lib/exerciseSwaps.ts) — or, during a session
 * that has its own exercise list (Batch 3b, 18 Oct 2026), on the server, so the
 * swap survives an app restart. "% match" is computed from real attributes (see lib/exerciseMatch.ts:
 * muscle group + equipment + difficulty); the reason chips re-rank and filter
 * the list by those same attributes. No "coach approved" claims are made.
 */
export function ExerciseSwapScreen({ route, navigation }: Props) {
  const { workoutId, workoutExerciseId, exerciseId, sessionId, sessionExerciseId } = route.params;
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [equipment, setEquipment] = useState(ALL);
  const [reason, setReason] = useState<SwapReason>(route.params.reason ?? "preference");
  const { data: exercise, isLoading, isError, refetch } = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: () => fetchExerciseDetail(exerciseId),
  });

  const equipmentOptions = useMemo(
    () => [ALL, ...Array.from(new Set((exercise?.alternatives ?? []).map((a) => a.equipment)))],
    [exercise],
  );
  const ranked = useMemo(
    () => (exercise ? rankAlternatives(exercise, exercise.alternatives, reason).filter((a) => equipment === ALL || a.equipment === equipment) : []),
    [exercise, reason, equipment],
  );
  const [best, ...others] = ranked;

  const choose = async (alt: Exercise | null) => {
    if (sessionId && sessionExerciseId) {
      if (!alt) {
        navigation.goBack();
        return;
      }
      setSaving(true);
      try {
        const exercises = await updateSessionExercise(sessionId, sessionExerciseId, { exerciseId: alt.id });
        queryClient.setQueryData<WorkoutSession>(["workoutSession", sessionId], (s) => (s ? { ...s, exercises } : s));
        navigation.goBack();
      } catch (err) {
        toast.show(extractErrorMessage(err, "Couldn't swap that exercise."), "error");
      } finally {
        setSaving(false);
      }
      return;
    }
    setSwap(workoutId, workoutExerciseId, alt);
    navigation.goBack();
  };

  if (isError) {
    return (
      <ScreenContainer edges={["top", "bottom"]} title="Swap Exercise">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  const chip = (label: string, selected: boolean, onPress: () => void, outlined = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        paddingHorizontal: spacing.md - 2,
        paddingVertical: 6,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? (outlined ? theme.accent : theme.aiAccent) : colors.border,
        backgroundColor: selected ? (outlined ? theme.accentSoft : colors.aiAccentSoft) : colors.surface,
      }}
    >
      <Text style={{ color: selected ? (outlined ? theme.accent : colors.aiAccent) : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScreenContainer edges={["top", "bottom"]} title="Swap Exercise">
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading || !exercise ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md }}>
            <Thumb exercise={exercise} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, ...typography.caption, letterSpacing: 0.6 }}>CURRENT EXERCISE</Text>
              <Text style={{ color: colors.textPrimary, ...typography.h3, marginTop: 2 }}>{exercise.name}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, textTransform: "capitalize" }}>
                {exercise.muscleGroup} · {exercise.equipment}
              </Text>
            </View>
          </Card>

          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, ...typography.label }}>Why are you swapping?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {REASONS.map((r) => chip(r.label, reason === r.value, () => setReason(r.value)))}
            </View>
            {route.params.painArea && reason === "joint_pain" ? (
              <Text style={{ color: colors.warningText, ...typography.meta }}>
                Pain in your {route.params.painArea}: options that are easier on your joints are listed first. If it still hurts, stop and skip
                this exercise.
              </Text>
            ) : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, ...typography.label }}>Equipment Available</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 }}>
              {equipmentOptions.map((eq) => chip(cap(eq), eq === equipment, () => setEquipment(eq), true))}
            </View>
          </View>

          {!best ? (
            <EmptyState
              title="No alternatives"
              subtitle={
                reason === "preference" && equipment === ALL
                  ? "There are no other exercises for this muscle group yet."
                  : "Nothing matches that reason and equipment. Try another filter."
              }
            />
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="sparkles" size={13} color={colors.aiAccent} />
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.6 }}>
                  FYNROX RECOMMENDATION
                </Text>
              </View>
              <Card style={{ borderColor: colors.aiAccent, backgroundColor: colors.surface, gap: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h2, flex: 1 }}>{best.name}</Text>
                  <View style={{ backgroundColor: colors.aiAccentSoft, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: colors.aiText, fontFamily: fonts.bodyBold, fontSize: 13 }}>{matchPercent(exercise, best)}% Match</Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
                  {swapReasonCopy(exercise, best, reason)}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {[
                    best.muscleGroup === exercise.muscleGroup ? "Same muscle group" : null,
                    best.equipment === exercise.equipment ? "Same equipment" : cap(best.equipment),
                    cap(best.difficulty),
                  ]
                    .filter((t): t is string => !!t)
                    .map((t) => (
                      <View key={t} style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.xs, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ color: colors.textSecondary, ...typography.caption }}>{t}</Text>
                      </View>
                    ))}
                </View>
                <Button label="Select Fynrox Alternative" variant="secondary" loading={saving} disabled={saving} onPress={() => choose(best)} />
              </Card>

              {others.length > 0 ? (
                <>
                  <Text style={{ color: colors.textPrimary, ...typography.h3, marginTop: spacing.xs }}>Other Smart Alternatives</Text>
                  <View style={{ gap: spacing.sm }}>
                    {others.map((alt) => (
                      <Card key={alt.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md - 2 }}>
                        <Thumb exercise={alt} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>{alt.name}</Text>
                          <Text style={{ color: colors.textMuted, ...typography.meta, textTransform: "capitalize" }}>
                            Match: {matchPercent(exercise, alt)}% · {alt.muscleGroup} / {alt.equipment}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => choose(alt)}
                          accessibilityRole="button"
                          accessibilityLabel={`Swap to ${alt.name}`}
                          style={{ backgroundColor: theme.accent, borderRadius: radius.xs + 2, paddingHorizontal: 14, paddingVertical: 7 }}
                        >
                          <Text style={{ color: theme.textOnAccent, fontFamily: fonts.bodySemi, fontSize: 13 }}>Select</Text>
                        </Pressable>
                      </Card>
                    ))}
                  </View>
                </>
              ) : null}
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                Match = same muscle group (50) + same equipment (30) + similar difficulty (up to 20). Swaps apply to this workout only.
              </Text>
            </>
          )}

          <Pressable onPress={() => choose(null)} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 14 }}>Keep Original Exercise</Text>
          </Pressable>
        </>
      )}
    </ScreenContainer>
  );
}
