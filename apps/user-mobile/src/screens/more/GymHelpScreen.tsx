import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GymHelpTopic } from "@fitness-ai-app/types";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { TextField } from "../../components/TextField";
import { createGymHelpRequest, fetchGymMe, GYM_HELP_KEY, GYM_ME_KEY } from "../../api/gym";
import { extractErrorMessage } from "../../lib/apiError";
import { GYM_HELP_TOPIC_LABEL } from "../../lib/gymFormat";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { RecoverShell } from "../recover/parts";
import { memberIdFor } from "./ProfileScreen";
import { useAuth } from "../../context/AuthContext";

/** Route params shared by the More and Train stacks (the screen is registered in both). */
export type GymHelpParams = { exerciseName?: string; workoutName?: string } | undefined;
type Props = NativeStackScreenProps<{ GymHelp: GymHelpParams }, "GymHelp">;

const TOPICS: GymHelpTopic[] = ["form_check", "machine_help", "trainer_available", "other"];
const NOTE_MAX = 300;

/**
 * Ask my gym for help (Figma My Gym 02). Sends POST /gym/help-requests with only
 * the topic, the exercise/workout names and an optional note; the gym also gets
 * the member's first name and member number (stamped server-side).
 */
export function GymHelpScreen({ navigation, route }: Props) {
  const { colors: theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const gymQ = useQuery({ queryKey: GYM_ME_KEY, queryFn: fetchGymMe, retry: false });
  const prefillExercise = route.params?.exerciseName;
  const prefillWorkout = route.params?.workoutName;
  const [topic, setTopic] = useState<GymHelpTopic>(prefillExercise ? "form_check" : "trainer_available");
  const [exercise, setExercise] = useState(prefillExercise ?? "");
  const [note, setNote] = useState("");

  const needsExercise = topic === "form_check" || topic === "machine_help";
  const firstName = user?.fullName?.trim().split(/\s+/)[0];
  const memberId = memberIdFor(user?.id);

  const send = useMutation({
    mutationFn: () =>
      createGymHelpRequest({
        topic,
        ...(needsExercise && exercise.trim() ? { exerciseName: exercise.trim() } : {}),
        ...(needsExercise && prefillWorkout ? { workoutName: prefillWorkout } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GYM_HELP_KEY });
      Alert.alert("Sent to your gym", "Staff usually reply in the gym. Response time isn't guaranteed.");
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't send", extractErrorMessage(err, "Check your connection and try again.")),
  });

  const gym = gymQ.data;
  const seen = [
    `Your first name${firstName ? ` (${firstName})` : ""} and member number${memberId ? ` (${memberId})` : ""}`,
    needsExercise ? "The exercise and your note" : "Your note",
    "Nothing else",
  ];

  return (
    <RecoverShell
      centered
      title="Ask my gym for help"
      subtitle={gym ? `${gym.gym.name}${gym.location ? ` · ${gym.location.name}` : ""}` : undefined}
      onBack={() => navigation.goBack()}
      footer={
        <>
          <Button label="Send to gym" onPress={() => send.mutate()} loading={send.isPending} disabled={!gym} />
          <Text style={{ color: colors.textMuted, ...typography.caption, textAlign: "center" }}>
            Staff usually reply in the gym. Response time isn't guaranteed.
          </Text>
        </>
      }
    >
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>What do you need help with?</Text>
      <View style={{ gap: spacing.sm }}>
        {TOPICS.map((t) => {
          const on = topic === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTopic(t)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                padding: 14,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: on ? theme.accent : colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: on ? theme.accent : colors.textMuted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accent }} /> : null}
              </View>
              <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{GYM_HELP_TOPIC_LABEL[t]}</Text>
            </Pressable>
          );
        })}
      </View>

      {needsExercise ? (
        prefillExercise ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 2 }}>
            <Text style={{ color: colors.textMuted, ...typography.caption }}>Exercise</Text>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>
              {prefillExercise}
              {prefillWorkout ? ` · ${prefillWorkout}` : ""}
            </Text>
          </View>
        ) : (
          <TextField label="Exercise (optional)" value={exercise} onChangeText={setExercise} maxLength={120} placeholder="e.g. Seated Cable Row" />
        )
      ) : null}

      <TextField
        label="Note for gym staff (optional)"
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX}
        multiline
        placeholder="Anything that helps staff find you"
        helper={`${note.length}/${NOTE_MAX}`}
      />

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>What the gym will see</Text>
        {seen.map((s) => (
          <View key={s} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Icon name="check" size={14} color={colors.success} />
            <Text style={{ flex: 1, color: colors.textSecondary, ...typography.meta }}>{s}</Text>
          </View>
        ))}
      </View>
    </RecoverShell>
  );
}
