import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, fonts, radius, spacing, themed } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { FocusRing, useFocusState } from "./FocusRing";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /** @deprecated Disabled buttons are always the flat grey "unavailable" style now (Oct 2026); kept so existing call sites compile. */
  mutedWhenDisabled?: boolean;
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
  mutedWhenDisabled: _mutedWhenDisabled,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const { colors: theme } = useTheme();
  const { focused, focusProps } = useFocusState();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      {...focusProps}
      android_ripple={{ color: isPrimary ? "rgba(255,255,255,0.18)" : colors.ripple }}
      style={({ pressed }: { pressed: boolean }) => [
        styles.base,
        isPrimary ? [styles.primary, { backgroundColor: theme.accent }] : styles.secondary,
        // Disabled = flat grey, label still readable (textMuted, >= 4.5:1). Loading keeps full colour: it is busy, not unavailable.
        disabled && (isPrimary ? styles.mutedDisabled : styles.secondaryDisabled),
        pressed && styles.pressed,
        style,
      ]}
    >
      <FocusRing visible={focused} radius={radius.md} />
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.textOnAccent : theme.accent} />
      ) : (
        <Text
          style={[
            styles.label,
            isPrimary ? [styles.labelPrimary, { color: disabled ? colors.textMuted : theme.textOnAccent }] : [styles.labelSecondary, disabled && { color: colors.textMuted }],
          ]}
        >{label}</Text>
      )}
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.88,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  mutedDisabled: {
    backgroundColor: colors.surfaceHigh,
  },
  secondaryDisabled: {
    backgroundColor: "transparent",
    borderColor: colors.border,
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
}));
