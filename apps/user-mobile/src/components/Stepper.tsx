import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { colors, fonts, radius, spacing } from "../theme/tokens";

interface StepperProps {
  label: string;
  value: number | undefined;
  unit: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}

/** Stepper input for age/weight/height — docs/mobile/03-screen-inventory.md §A "Setup: About You". */
export function Stepper({ label, value, unit, step = 1, min = 0, max = 999, onChange }: StepperProps) {
  const current = value ?? min;

  const decrement = () => onChange(Math.max(min, Math.round((current - step) * 10) / 10));
  const increment = () => onChange(Math.min(max, Math.round((current + step) * 10) / 10));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controls}>
        <Pressable
          onPress={decrement}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityHint={`Current value ${value ?? min} ${unit}`}
          style={styles.button}
        >
          <Icon name="minus" size={18} color={colors.accent} strokeWidth={2.5} />
        </Pressable>
        <Text style={styles.value} accessibilityLabel={`${label}: ${value ?? "not set"} ${unit}`}>
          {value ?? "–"} <Text style={styles.unit}>{unit}</Text>
        </Text>
        <Pressable
          onPress={increment}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityHint={`Current value ${value ?? min} ${unit}`}
          style={styles.button}
        >
          <Icon name="plus" size={18} color={colors.accent} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    minWidth: 72,
    textAlign: "center",
  },
  unit: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.body,
  },
});
