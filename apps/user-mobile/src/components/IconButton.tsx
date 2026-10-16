import React from "react";
import { Pressable, StyleProp, ViewStyle } from "react-native";
import { Icon, IconName } from "./Icon";
import { colors, radius, touch } from "../theme/tokens";
import { FocusRing, useFocusState } from "./FocusRing";

interface IconButtonProps {
  icon: IconName;
  /** Required: an icon-only control has no visible text, so screen readers need this. */
  accessibilityLabel: string;
  onPress: () => void;
  /**
   * `tonal` (default) is the Figma FX/Icon button: 36 px raised square with a
   * border. `plain` drops the fill for toolbar use; `accent` fills with the
   * accent colour for a single primary icon action.
   */
  variant?: "tonal" | "plain" | "accent";
  /** Visual size in px. The touch target is always at least 48 px (Material). */
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Icon-only button — Figma "FX/Icon button" (00 — FynroX Design System).
 * Keeps the 36 px visual from Figma and pads the hit area out to 48 px with
 * hitSlop, so it meets Material's minimum touch target without changing layouts.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = "tonal",
  size = 36,
  iconSize = 18,
  disabled,
  selected,
  style,
}: IconButtonProps) {
  const slop = Math.max(0, Math.ceil((touch.min - size) / 2));
  const { focused, focusProps } = useFocusState();
  const fill =
    variant === "accent"
      ? { backgroundColor: colors.accent, borderWidth: 0 }
      : variant === "plain"
        ? { backgroundColor: "transparent", borderWidth: 0 }
        : { backgroundColor: selected ? colors.accentSoft : colors.surfaceRaised, borderWidth: 1, borderColor: selected ? colors.accent : colors.border };
  const iconColor = variant === "accent" ? colors.textOnAccent : selected ? colors.accentText : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      hitSlop={slop}
      {...focusProps}
      android_ripple={{ color: colors.ripple, borderless: variant === "plain", radius: touch.min / 2 }}
      style={({ pressed }: { pressed: boolean }) => [
        {
          width: size,
          height: size,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        fill,
        style,
      ]}
    >
      <FocusRing visible={focused} radius={radius.sm} />
      <Icon name={icon} size={iconSize} color={iconColor} />
    </Pressable>
  );
}
