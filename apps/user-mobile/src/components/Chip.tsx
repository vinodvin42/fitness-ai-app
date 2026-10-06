import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { Icon } from "./Icon";

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /**
   * Overrides the screen-reader label (defaults to `label`) — needed where
   * the visible label alone is ambiguous out of context, e.g. a bare
   * rating-scale number ("3") that means nothing without the rating it
   * belongs to ("Energy: 3 of 5").
   */
  accessibilityLabel?: string;
  /**
   * Selected look. `solid` (default) is the filled accent pill; `danger`
   * (Figma allergen chips) is a red outline with a warning glyph; `outlined`
   * (Figma injury chips) is an accent outline with a leading dot.
   */
  variant?: "solid" | "danger" | "outlined";
  /** Show a leading check mark when selected (Figma goal chips). */
  showCheck?: boolean;
}

/** Single/multi-select pill — docs/mobile/04-design-system.md §5 "Chip selector". */
export function Chip({ label, selected, onPress, accessibilityLabel, variant = "solid", showCheck }: ChipProps) {
  const { colors: theme } = useTheme();
  const selectedStyle =
    variant === "danger"
      ? { borderColor: colors.danger, backgroundColor: colors.dangerSoft }
      : variant === "outlined"
        ? { borderColor: theme.accent, backgroundColor: theme.accentSoft }
        : { borderColor: theme.accent, backgroundColor: theme.accent };
  const textColor = !selected
    ? colors.textSecondary
    : variant === "danger"
      ? colors.danger
      : variant === "outlined"
        ? theme.accent
        : theme.textOnAccent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && selectedStyle]}
    >
      <View style={styles.inner}>
        {selected && variant === "danger" ? <Icon name="alert-triangle" size={13} color={textColor} /> : null}
        {selected && variant === "outlined" ? <View style={[styles.dot, { backgroundColor: textColor }]} /> : null}
        {selected && variant === "solid" && showCheck ? <Icon name="check" size={13} color={textColor} strokeWidth={3} /> : null}
        <Text style={[styles.label, { color: textColor }, selected && styles.labelSelected]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inner: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
  },
  labelSelected: {
    fontFamily: fonts.bodySemi,
  },
});
