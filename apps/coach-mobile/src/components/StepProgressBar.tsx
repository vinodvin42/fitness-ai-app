import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/tokens";

interface StepProgressBarProps {
  step: number;
  total: number;
  label: string;
}

/** "Coach Onboarding — Step X of 3" — docs/coach/03-screen-inventory.md §B. Copied near-verbatim from apps/user-mobile. */
export function StepProgressBar({ step, total, label }: StepProgressBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
      </View>
      <Text style={styles.label}>
        Step {step} of {total} — {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
});
