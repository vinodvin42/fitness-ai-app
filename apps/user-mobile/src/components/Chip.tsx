import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

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
}

/** Single/multi-select pill — docs/mobile/04-design-system.md §5 "Chip selector". */
export function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && { borderColor: theme.accent, backgroundColor: theme.accent }]}
    >
      <Text style={[styles.label, selected && [styles.labelSelected, { color: theme.textOnAccent }]]}>{label}</Text>
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
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
  },
  labelSelected: {
    fontFamily: fonts.bodySemi,
  },
});
