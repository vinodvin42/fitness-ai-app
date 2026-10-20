import React from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface Option {
  key: string;
  icon: IconName;
  title: string;
  detail: string;
  onPress: () => void;
}

/**
 * Figma train/in-workout-safety-sheet (235:34554): "Pain or equipment busy?" during a workout.
 * The workout is paused while it's open (ActiveWorkoutScreen's own pause). Each choice leads to
 * something the app already does: the swap screen with the matching reason preselected, or, once
 * sets of this exercise are logged (when a swap isn't allowed), moving on.
 *
 * Not built, by design:
 * - the body-part picker: nothing would use the answer yet;
 * - "tell your professional": there is no API for it;
 * - "only equipment your gym lists as available": the swap list doesn't read gym equipment status.
 */
export function InWorkoutSafetySheet({
  visible,
  canSwap,
  isLastExercise,
  onPainSwap,
  onEquipmentSwap,
  onSkip,
  onResume,
}: {
  visible: boolean;
  /** False once sets of this exercise are logged (the exercise menu hides "Replace" then too). */
  canSwap: boolean;
  isLastExercise: boolean;
  onPainSwap: () => void;
  onEquipmentSwap: () => void;
  onSkip: () => void;
  onResume: () => void;
}) {
  const options: Option[] = canSwap
    ? [
        {
          key: "pain",
          icon: "alert-triangle",
          title: "Something hurts",
          detail: "Swap to another exercise. Machines, cables, bodyweight and bands are shown first.",
          onPress: onPainSwap,
        },
        {
          key: "equipment",
          icon: "swap",
          title: "Equipment busy",
          detail: "Swap to an exercise for the same muscles that uses different equipment.",
          onPress: onEquipmentSwap,
        },
      ]
    : [
        {
          key: "skip",
          icon: "skip-forward",
          title: isLastExercise ? "Finish the workout here" : "Skip to the next exercise",
          detail: "You've logged sets of this exercise, so it can't be swapped now. Those sets stay saved.",
          onPress: onSkip,
        },
      ];

  return (
    <BottomSheet visible={visible} onClose={onResume} title="Pain or equipment busy?">
      <Text style={{ color: colors.textSecondary, ...typography.bodySmall }}>Your workout is paused. Pick one.</Text>
      <View style={{ gap: spacing.sm }}>
        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={o.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${o.title}. ${o.detail}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceRaised,
            }}
          >
            <Icon name={o.icon} size={20} color={o.key === "pain" ? colors.warningText : colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{o.title}</Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>{o.detail}</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        If pain continues, stop and speak to a professional.
      </Text>
      <Button label="Resume workout" variant="secondary" onPress={onResume} />
    </BottomSheet>
  );
}
