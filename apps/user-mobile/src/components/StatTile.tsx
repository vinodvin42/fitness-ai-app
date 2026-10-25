import React from "react";
import { Text, View, ViewStyle } from "react-native";
import { Icon, IconName } from "./Icon";
import { MetricValue } from "./MetricValue";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";

interface StatTileProps {
  icon: IconName;
  label: string;
  value: string | number;
  /** Optional unit rendered smaller after the value, e.g. "kg". */
  unit?: string;
  /** Accent color for the icon well (defaults to the app accent). */
  tint?: string;
  tintSoft?: string;
  /** Optional change line under the label, e.g. "+1.2 kg this week". Write the sign into the text. */
  delta?: string;
  /**
   * How the change reads: "up" is an improvement (green), "down" a setback (red), "neutral" plain.
   * Pick by meaning, not by sign: weight going down on a fat-loss goal is "up". Defaults to "neutral".
   */
  deltaTone?: "up" | "down" | "neutral";
  style?: ViewStyle;
}

const DELTA_COLOR = { up: () => colors.successText, down: () => colors.dangerText, neutral: () => colors.textMuted } as const;

/**
 * Icon-well + value + label tile (docs/mobile/04-design-system.md §5
 * "Stat/metric tile"). Added 31 Aug 2026. Used in readiness factors,
 * recovery metrics, activity/summary rows. 25 Oct 2026: an optional delta line
 * with an up / down / neutral tone.
 */
export function StatTile({
  icon,
  label,
  value,
  unit,
  tint = colors.accent,
  tintSoft = colors.accentSoft,
  delta,
  deltaTone = "neutral",
  style,
}: StatTileProps) {
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          gap: spacing.sm,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.sm,
          backgroundColor: tintSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={18} color={tint} />
      </View>
      <MetricValue value={value} unit={unit} size="medium" />
      <Text style={{ color: colors.textMuted, ...typography.caption, textTransform: "uppercase" }}>{label}</Text>
      {/* A ternary, not `delta && …`: an empty string would otherwise render bare text and crash. */}
      {delta ? (
        <Text
          style={{ color: DELTA_COLOR[deltaTone](), ...typography.caption, fontFamily: fonts.bodySemi }}
          accessibilityLabel={`${delta}${deltaTone === "up" ? ", improving" : deltaTone === "down" ? ", getting worse" : ""}`}
          numberOfLines={1}
        >
          {delta}
        </Text>
      ) : null}
    </View>
  );
}
