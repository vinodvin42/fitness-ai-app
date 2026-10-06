import React from "react";
import { Switch, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { UpdateWorkoutSettingsInput, WorkoutSettings } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { BackButton } from "../../components/BackButton";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Stepper } from "../../components/Stepper";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { updateWorkoutSettings, useWorkoutSettings, WORKOUT_SETTINGS_KEY } from "../../api/workoutSettings";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "WorkoutSettings">;

const UNITS = [
  { value: "kg", label: "Kilograms" },
  { value: "lb", label: "Pounds" },
] as const;

/**
 * Workout Settings (Train 16) bound to /users/me/workout-settings. Rest timer
 * length and weight unit are applied in the Set/Rest tracker and rest timer;
 * the remaining toggles are saved to the account but not acted on by the app
 * yet, and are labelled that way rather than implying otherwise.
 */
export function WorkoutSettingsScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useWorkoutSettings();

  const mutation = useMutation({
    mutationFn: (input: UpdateWorkoutSettingsInput) => updateWorkoutSettings(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: WORKOUT_SETTINGS_KEY });
      const prev = queryClient.getQueryData<WorkoutSettings>(WORKOUT_SETTINGS_KEY);
      if (prev) queryClient.setQueryData<WorkoutSettings>(WORKOUT_SETTINGS_KEY, { ...prev, ...input });
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(WORKOUT_SETTINGS_KEY, ctx.prev);
      toast.show(extractErrorMessage(err, "Couldn't save that setting."), "error");
    },
    onSuccess: (saved) => queryClient.setQueryData(WORKOUT_SETTINGS_KEY, saved),
  });

  const toggles: Array<{ key: "autoStartRest" | "countdownSound" | "keepScreenAwake" | "defaultRpeTracking"; label: string; help: string }> = [
    { key: "autoStartRest", label: "Auto-start rest timer", help: "Saved to your account. Not applied by the app yet." },
    { key: "countdownSound", label: "Countdown sound", help: "Saved to your account. Not applied by the app yet." },
    { key: "keepScreenAwake", label: "Keep screen awake", help: "Saved to your account. Not applied by the app yet." },
    { key: "defaultRpeTracking", label: "Track RPE by default", help: "Saved to your account. Not applied by the app yet." },
  ];

  return (
    <ScreenContainer title="Workout Settings" subtitle="How your sessions behave">
      <BackButton onPress={() => navigation.goBack()} />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      ) : (
        <>
          <Card style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Rest timer</Text>
            <Stepper
              label="Default rest"
              value={data.restTimerSeconds}
              unit="sec"
              step={15}
              min={15}
              max={600}
              onChange={(v) => mutation.mutate({ restTimerSeconds: v })}
            />
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              The rest timer starts at this length after each set.
            </Text>
          </Card>

          <Card style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Weight unit</Text>
            <SegmentedControl options={UNITS} value={data.weightUnit} onChange={(v) => mutation.mutate({ weightUnit: v })} />
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              Weights are stored in kilograms and converted for display and entry.
            </Text>
          </Card>

          <Card>
            {toggles.map((t, i) => (
              <View
                key={t.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  paddingVertical: spacing.sm,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t.label}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>{t.help}</Text>
                </View>
                <Switch
                  value={data[t.key]}
                  onValueChange={(v) => mutation.mutate({ [t.key]: v })}
                  accessibilityLabel={t.label}
                  trackColor={{ true: colors.accent, false: colors.border }}
                />
              </View>
            ))}
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}
