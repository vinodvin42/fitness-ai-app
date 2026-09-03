import React from "react";
import { Text, View, ViewStyle } from "react-native";
import { Icon, IconName } from "./Icon";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface StatTileProps {
  icon: IconName;
  label: string;
  value: string | number;
  /** Accent color for the icon well (defaults to the app accent). */
  tint?: string;
  tintSoft?: string;
  style?: ViewStyle;
}

/**
 * Icon-well + value + label tile (docs/mobile/04-design-system.md §5
 * "Stat/metric tile"). Added 31 Aug 2026. Used in readiness factors,
 * recovery metrics, activity/summary rows.
 */
export function StatTile({ icon, label, value, tint = colors.accent, tintSoft = colors.accentSoft, style }: StatTileProps) {
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
      <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{value}</Text>
      <Text style={{ color: colors.textMuted, ...typography.caption, textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}
