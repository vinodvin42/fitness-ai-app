import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts, radius, spacing } from "../theme/tokens";

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Single/multi-select pill — docs/mobile/04-design-system.md §5 "Chip selector". */
export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
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
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
  },
  labelSelected: {
    color: "#0B0B0F",
    fontFamily: fonts.bodySemi,
  },
});
