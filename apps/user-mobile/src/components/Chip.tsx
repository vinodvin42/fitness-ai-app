import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, spacing, themed, touch } from "../theme/tokens";
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
      ? { borderColor: colors.dangerText, backgroundColor: colors.dangerSoft }
      : variant === "outlined"
        ? { borderColor: theme.accent, backgroundColor: theme.accentSoft }
        : { borderColor: theme.accent, backgroundColor: theme.accent };
  const textColor = !selected
    ? colors.textSecondary
    : variant === "danger"
      ? colors.dangerText
      : variant === "outlined"
        ? theme.accentText
        : theme.textOnAccent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      hitSlop={HIT_SLOP}
      android_ripple={{ color: colors.ripple }}
      style={({ pressed }: { pressed: boolean }) => [styles.chip, selected && selectedStyle, pressed && styles.pressed]}
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

/** 40 px visual height + 4 px slop above and below = 48 px touch target (Material). */
const CHIP_HEIGHT = 40;
const HIT_SLOP = { top: (touch.min - CHIP_HEIGHT) / 2, bottom: (touch.min - CHIP_HEIGHT) / 2, left: 0, right: 0 };

const styles = themed(() => StyleSheet.create({
  chip: {
    minHeight: CHIP_HEIGHT,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
  pressed: { opacity: 0.85 },
}));
