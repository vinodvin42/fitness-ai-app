import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /**
   * Overrides the screen-reader label (defaults to `label`) — use when the
   * visible text alone doesn't say what the action does, e.g. a short
   * "Retry" button that needs more context read aloud than a sighted user
   * gets from surrounding layout.
   */
  accessibilityLabel?: string;
  /** Extra screen-reader-only context read after the label (VoiceOver/TalkBack "hint"). */
  accessibilityHint?: string;
}

/** Shared primary/secondary button — docs/mobile/04-design-system.md §5 "build these once, reuse everywhere". */
export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        styles.base,
        isPrimary ? [styles.primary, { backgroundColor: theme.accent }] : styles.secondary,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.textOnAccent : theme.accent} />
      ) : (
        <Text style={[styles.label, isPrimary ? [styles.labelPrimary, { color: theme.textOnAccent }] : styles.labelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontFamily: fonts.displayBold,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  labelPrimary: {
    color: colors.textOnAccent,
  },
  labelSecondary: {
    color: colors.textPrimary,
  },
});
