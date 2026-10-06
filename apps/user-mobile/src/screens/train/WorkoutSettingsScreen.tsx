import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { TrainingDayKey, UpdateWorkoutSettingsInput, WorkoutEquipment, WorkoutSettings } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { BackButton } from "../../components/BackButton";
import { Icon } from "../../components/Icon";
import { ValueSlider } from "../../components/ValueSlider";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { updateWorkoutSettings, useWorkoutSettings, WORKOUT_SETTINGS_KEY } from "../../api/workoutSettings";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { TrainStackParamList } from "../../navigation/TrainStack";
import type { MainTabsParamList } from "../../navigation/MainTabs";

type Props = NativeStackScreenProps<TrainStackParamList, "WorkoutSettings">;

const EQUIPMENT: Array<{ value: WorkoutEquipment; label: string }> = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "cables", label: "Cables" },
  { value: "machines", label: "Machines" },
  { value: "bands", label: "Bands" },
  { value: "kettlebells", label: "Kettlebells" },
  { value: "bodyweight", label: "Bodyweight" },
];

const DAYS: Array<{ value: TrainingDayKey; letter: string; name: string }> = [
  { value: "mon", letter: "M", name: "Monday" },
  { value: "tue", letter: "T", name: "Tuesday" },
  { value: "wed", letter: "W", name: "Wednesday" },
  { value: "thu", letter: "T", name: "Thursday" },
  { value: "fri", letter: "F", name: "Friday" },
  { value: "sat", letter: "S", name: "Saturday" },
  { value: "sun", letter: "S", name: "Sunday" },
];

type ToggleKey = "autoStartRest" | "audioCoaching" | "autoDeloadWeek";

/**
 * Preferences / Workout Settings (Figma Train 16), bound to
 * /users/me/workout-settings. Training days and equipment start from, and are
 * written back to, the onboarding profile. Rest-timer length, weight unit,
 * training days and equipment are used across the app; the audio-coaching and
 * auto-deload switches are stored on the account but nothing acts on them yet,
 * which the footnote says plainly.
 */
export function WorkoutSettingsScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { colors: theme } = useTheme();
  const tabs = useNavigation<NavigationProp<MainTabsParamList>>();
  const { data, isLoading, isError, refetch } = useWorkoutSettings();
  const [draftDuration, setDraftDuration] = useState<number | null>(null);

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

  const toggles: Array<{ key: ToggleKey; label: string; help: string }> = [
    { key: "autoStartRest", label: "Rest timer auto-start", help: "Start rest period instantly" },
    { key: "audioCoaching", label: "Audio coaching", help: "Voice instructions for exercises" },
    { key: "autoDeloadWeek", label: "Auto-deload week", help: "Reduce strain every 6 weeks" },
  ];

  const cardStyle = { gap: spacing.sm, paddingVertical: spacing.md - 2 } as const;

  return (
    <ScreenContainer title="Preferences" subtitle="How your sessions behave">
      <BackButton onPress={() => navigation.goBack()} />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : (
        <>
          <Card style={cardStyle}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Preferred Duration</Text>
              <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                {draftDuration ?? data.preferredDurationMinutes} mins
              </Text>
            </View>
            <ValueSlider
              value={data.preferredDurationMinutes}
              min={15}
              max={120}
              step={5}
              onChange={setDraftDuration}
              onCommit={(v) => {
                setDraftDuration(null);
                if (v !== data.preferredDurationMinutes) mutation.mutate({ preferredDurationMinutes: v });
              }}
              accessibilityLabel="Preferred workout duration in minutes"
            />
          </Card>

          <Card style={{ paddingVertical: spacing.xs }}>
            {toggles.map((t, i) => (
              <View
                key={t.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  paddingVertical: spacing.md - 2,
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
                  trackColor={{ true: theme.accent, false: colors.surfaceHigh }}
                  thumbColor={colors.textPrimary}
                />
              </View>
            ))}
          </Card>

          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Default rest</Text>
              <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 13 }}>{data.restTimerSeconds} sec</Text>
            </View>
            <ValueSlider
              value={data.restTimerSeconds}
              min={15}
              max={300}
              step={15}
              onCommit={(v) => v !== data.restTimerSeconds && mutation.mutate({ restTimerSeconds: v })}
              accessibilityLabel="Default rest timer in seconds"
            />
          </Card>

          <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Measurement Units</Text>
            <View style={{ flexDirection: "row", gap: 4, backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, padding: 3 }}>
              {(["kg", "lb"] as const).map((u) => {
                const on = data.weightUnit === u;
                return (
                  <Pressable
                    key={u}
                    onPress={() => !on && mutation.mutate({ weightUnit: u })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={u === "kg" ? "Kilograms" : "Pounds"}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 6,
                      borderRadius: radius.xs + 2,
                      backgroundColor: on ? theme.accent : "transparent",
                    }}
                  >
                    <Text style={{ color: on ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                      {u}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card style={cardStyle}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Available Equipment</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {EQUIPMENT.map((e) => {
                const on = data.equipment.includes(e.value);
                return (
                  <Pressable
                    key={e.value}
                    onPress={() =>
                      mutation.mutate({
                        equipment: on ? data.equipment.filter((x) => x !== e.value) : [...data.equipment, e.value],
                      })
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{
                      paddingHorizontal: spacing.md - 2,
                      paddingVertical: 7,
                      borderRadius: radius.sm,
                      backgroundColor: on ? theme.accent : colors.surfaceHigh,
                    }}
                  >
                    <Text style={{ color: on ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
                      {e.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card style={cardStyle}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Training Days</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {DAYS.map((d) => {
                const on = data.trainingDays.includes(d.value);
                return (
                  <Pressable
                    key={d.value}
                    onPress={() =>
                      mutation.mutate({
                        trainingDays: on ? data.trainingDays.filter((x) => x !== d.value) : [...data.trainingDays, d.value],
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={d.name}
                    accessibilityState={{ selected: on }}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: on ? theme.accent : colors.surfaceHigh,
                    }}
                  >
                    <Text style={{ color: on ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                      {d.letter}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {data.trainingDays.length === 0
                ? "Pick the days you can train. This also sets your weekly consistency goal."
                : `${data.trainingDays.length} day${data.trainingDays.length === 1 ? "" : "s"} a week. Shared with your onboarding profile and used for your weekly consistency goal.`}
            </Text>
          </Card>

          <Pressable
            onPress={() => tabs.navigate("Recover", { screen: "ConnectedDevices" })}
            accessibilityRole="button"
            accessibilityLabel="Wearable heart rate zones: connect a wearable"
          >
            <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Wearable Heart Rate Zones</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 13 }}>Not connected</Text>
                <Icon name="chevron-right" size={16} color={theme.accent} />
              </View>
            </Card>
          </Pressable>

          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            Rest length, units, equipment and training days are used across the app. Audio coaching and auto-deload are saved to your
            account; voice prompts and automatic deload weeks are not available yet.
          </Text>
        </>
      )}
    </ScreenContainer>
  );
}
