import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import type { GymMe, OnboardingProfile, WorkoutHistoryEntry } from "@fitness-ai-app/types";
import { Icon } from "./Icon";
import { getNotificationPermissionState } from "../lib/reminderNotifications";
import { PARTNER_PROGRAMS_ENABLED } from "../lib/partnerPrograms";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const HIDDEN_KEY = "today.setupChecklist.hidden";

export type SetupStep = "goal" | "body" | "notifications" | "workout" | "gym";

export interface SetupItem {
  key: SetupStep;
  label: string;
  done: boolean;
  /** Optional steps are listed but don't count toward "x of y done" (not everyone has a partner gym). */
  optional?: boolean;
}

/**
 * The checklist rows, from data Today already loads. Pure, so it can be checked without a device.
 * `notifications` is null on web (no OS permission there), which leaves that row out.
 */
export function setupItems(input: {
  profile: OnboardingProfile | undefined;
  history: WorkoutHistoryEntry[] | undefined;
  gym: GymMe | undefined;
  notifications: boolean | null;
}): SetupItem[] {
  const { profile, history, gym, notifications } = input;
  const items: SetupItem[] = [
    { key: "goal", label: "Goal set", done: (profile?.goals.length ?? 0) > 0 },
    { key: "body", label: "Height & weight added", done: profile?.heightCm != null && profile?.weightKg != null },
  ];
  if (notifications !== null) items.push({ key: "notifications", label: "Reminders switched on", done: notifications });
  items.push({ key: "workout", label: "First workout done", done: (history ?? []).some((h) => h.status === "completed") });
  // Gym partners are hidden for now (lib/partnerPrograms.ts).
  if (PARTNER_PROGRAMS_ENABLED) items.push({ key: "gym", label: "Gym linked", done: !!gym, optional: true });
  return items;
}

/**
 * Figma today/00-setup-checklist (235:34676): "Your setup · 3 of 5 done" at the top of Today until
 * the required steps are done. Each open row goes where that step is done. The member can hide it.
 *
 * Differs from Figma, on purpose:
 * - "Phone verified": sign-in is by email (phone/OTP is an open owner decision).
 * - "Make your plan safer" and "Food preferences": both are answered in the first-run setup, and
 *   there is no screen to change them afterwards yet.
 */
export function SetupChecklistCard({
  profile,
  history,
  gym,
  onOpen,
}: {
  profile: OnboardingProfile | undefined;
  history: WorkoutHistoryEntry[] | undefined;
  gym: GymMe | undefined;
  onOpen: (step: SetupStep) => void;
}) {
  const { colors: theme } = useTheme();
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [notifications, setNotifications] = useState<boolean | null>(Platform.OS === "web" ? null : false);

  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY)
      .then((v) => setHidden(v === "1"))
      .catch(() => setHidden(false));
  }, []);

  // Re-read the OS permission each time Today is shown (the member may have just switched it on).
  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS === "web") return;
      let live = true;
      getNotificationPermissionState().then((s) => live && setNotifications(s === "granted"));
      return () => {
        live = false;
      };
    }, []),
  );

  // Wait for the data, so a finished member never sees the card flash in.
  if (hidden !== false || !profile || !history) return null;
  const items = setupItems({ profile, history, gym, notifications });
  const required = items.filter((i) => !i.optional);
  const done = required.filter((i) => i.done).length;
  if (done === required.length) return null;

  const hide = () => {
    setHidden(true);
    AsyncStorage.setItem(HIDDEN_KEY, "1").catch(() => undefined);
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Your setup</Text>
        <Text style={{ color: theme.accentText, ...typography.label, fontSize: 13 }}>
          {done} of {required.length} done
        </Text>
      </View>
      <View style={{ height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${Math.round((done / required.length) * 100)}%`, backgroundColor: theme.accent }} />
      </View>
      {items.map((item) =>
        item.done ? (
          <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 32 }}>
            <Icon name="check" size={16} color={colors.successText} />
            <Text style={{ color: colors.textSecondary, ...typography.bodySmall }}>{item.label}</Text>
          </View>
        ) : (
          <Pressable
            key={item.key}
            onPress={() => onOpen(item.key)}
            accessibilityRole="button"
            accessibilityLabel={`${OPEN_LABEL[item.key]}${item.optional ? ", optional" : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40 }}
          >
            <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.textMuted }} />
            <Text style={{ flex: 1, color: colors.textPrimary, ...typography.bodySmall }}>
              {OPEN_LABEL[item.key]}
              {item.optional ? <Text style={{ color: colors.textMuted }}> · optional</Text> : null}
            </Text>
            <Icon name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>
        ),
      )}
      <Pressable onPress={hide} accessibilityRole="button" accessibilityLabel="Hide setup checklist" hitSlop={6} style={{ alignSelf: "flex-start" }}>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>Hide checklist</Text>
      </Pressable>
    </View>
  );
}

const OPEN_LABEL: Record<SetupStep, string> = {
  goal: "Set your goal",
  body: "Add height & weight",
  notifications: "Switch on reminders",
  workout: "Do your first workout",
  gym: "Link your gym with its code",
};
