import React, { useEffect, useState } from "react";
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
 * "Something hurts" first asks where (24 Oct 2026); the swap screen names that area and lists
 * options that are easier on joints first.
 *
 * Not built, by design:
 * - "tell your professional": there is no API for it;
 * - "only equipment your gym lists as available": the swap list doesn't read gym equipment status.
 */
const PAIN_AREAS = ["Neck", "Shoulder", "Elbow", "Wrist", "Back", "Hip", "Knee", "Ankle", "Other"];

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
  /** The body area picked under "Something hurts". */
  onPainSwap: (area: string) => void;
  onEquipmentSwap: () => void;
  onSkip: () => void;
  onResume: () => void;
}) {
  const [askingArea, setAskingArea] = useState(false);
  const [area, setArea] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setAskingArea(false);
      setArea(null);
    }
  }, [visible]);
  const options: Option[] = canSwap
    ? [
        {
          key: "pain",
          icon: "alert-triangle",
          title: "Something hurts",
          detail: "Tell us where, then swap to another exercise. Machines, cables, bodyweight and bands are shown first.",
          onPress: () => setAskingArea(true),
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
      <Text style={{ color: colors.textSecondary, ...typography.bodySmall }}>
        {askingArea ? "Where does it hurt?" : "Your workout is paused. Pick one."}
      </Text>
      {askingArea ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {PAIN_AREAS.map((a) => {
              const selected = area === a;
              return (
                <Pressable
                  key={a}
                  onPress={() => setArea(a)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: selected ? colors.warning : colors.border,
                    backgroundColor: selected ? colors.warningSoft : colors.surfaceRaised,
                  }}
                >
                  <Text style={{ color: selected ? colors.warningText : colors.textPrimary, ...typography.label, fontSize: 13 }}>{a}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button label="Show safer swaps" disabled={!area} onPress={() => area && onPainSwap(area.toLowerCase())} />
          <Pressable onPress={() => setAskingArea(false)} accessibilityRole="button" hitSlop={6} style={{ alignSelf: "center" }}>
            <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 13 }}>‹ Back</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={{ gap: spacing.sm, display: askingArea ? "none" : "flex" }}>
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
