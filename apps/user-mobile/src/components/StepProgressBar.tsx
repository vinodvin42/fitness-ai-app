import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, spacing } from "../theme/tokens";
import { BRAND_NAME } from "../lib/brand";
import { useTheme } from "../theme/ThemeProvider";

interface StepProgressBarProps {
  step: number;
  total: number;
  /** Overrides the default "Step {step} of {total}" caption. */
  caption?: string;
  /** Overrides the bar fill (0-1); defaults to step / total. */
  progress?: number;
  /** Hide the brand name on the right (non-onboarding uses). */
  showBrand?: boolean;
}

/** Figma onboarding header: thin progress bar, then "Step N of M" (accent) with the brand name on the right. */
export function StepProgressBar({ step, total, caption, progress, showBrand = true }: StepProgressBarProps) {
  const { colors: theme } = useTheme();
  const fraction = Math.max(0, Math.min(1, progress ?? step / total));
  return (
    <View style={styles.container}>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }}>
        <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: theme.accent }]} />
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.accent }]}>{caption ?? `Step ${step} of ${total}`}</Text>
        {showBrand ? <Text style={styles.brand}>{BRAND_NAME}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.sm },
  track: { height: 3, borderRadius: 999, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  label: { fontSize: 11, fontFamily: fonts.bodySemi },
  brand: { color: colors.textPrimary, fontSize: 11, fontFamily: fonts.bodySemi },
});
