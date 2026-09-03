import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing } from "../theme/tokens";

interface StepProgressBarProps {
  step: number;
  total: number;
  label: string;
}

/** "5-step progress indicator from step 3 onward" — docs/mobile/03-screen-inventory.md §A. */
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
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    marginTop: spacing.sm,
  },
});
