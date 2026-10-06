import React from "react";
import { Pressable, Text } from "react-native";
import { Icon } from "./Icon";
import { colors, spacing, typography } from "../theme/tokens";

/** Inline "‹ Back" link for stack screens that sit under a tab's root. */
export function BackButton({ onPress, label = "Back" }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start" }}
      hitSlop={8}
    >
      <Icon name="arrow-left" size={18} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, ...typography.label }}>{label}</Text>
    </Pressable>
  );
}
