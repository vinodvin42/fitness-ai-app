import React from "react";
import { StyleProp, Text, TextStyle } from "react-native";
import { colors, fonts, typography } from "../theme/tokens";

interface MetricValueProps {
  value: string | number;
  /** Shown smaller and quieter after the number, e.g. "kg", "kcal", "%". */
  unit?: string;
  /**
   * `large` = hero number (metricLarge 40/46) for one key figure per screen.
   * `medium` = tile/card figure (h1 24/30). `small` = inline list value (h3 16/22).
   */
  size?: "large" | "medium" | "small";
  color?: string;
  /** Never wrap: a number broken across lines is unreadable. Shrinks to fit instead. */
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

const UNIT: Record<NonNullable<MetricValueProps["size"]>, TextStyle> = {
  large: { fontFamily: fonts.bodySemi, fontSize: 18, lineHeight: 24, letterSpacing: 0 },
  medium: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  small: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
};

/**
 * Number + unit with a clear hierarchy: tabular figures for the number, the
 * unit about half the size in secondary colour, sharing one baseline (nested
 * Text). Single line, shrinking rather than wrapping.
 */
export function MetricValue({ value, unit, size = "medium", color, style, accessibilityLabel }: MetricValueProps) {
  const base = size === "large" ? typography.metricLarge : size === "medium" ? { ...typography.h1, fontVariant: ["tabular-nums" as const] } : { ...typography.h3, fontVariant: ["tabular-nums" as const] };
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      accessibilityLabel={accessibilityLabel ?? (unit ? `${value} ${unit}` : String(value))}
      style={[{ color: color ?? colors.textPrimary }, base, style]}
    >
      {value}
      {unit ? <Text style={[UNIT[size], { color: colors.textSecondary }]}>{` ${unit}`}</Text> : null}
    </Text>
  );
}
