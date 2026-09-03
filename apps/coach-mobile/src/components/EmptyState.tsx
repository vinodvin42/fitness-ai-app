import React from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { Button } from "./Button";
import { colors, spacing, typography } from "../theme/tokens";

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Shared empty-state block — copied near-verbatim from apps/user-mobile. */
export function EmptyState({ title, subtitle, actionLabel, onAction, style }: EmptyStateProps) {
  return (
    <View style={[{ alignItems: "center", paddingVertical: spacing.lg }, style]}>
      <Text style={{ color: colors.textPrimary, ...typography.h2, textAlign: "center" }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }}>{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: spacing.md, minWidth: 160 }} />
      ) : null}
    </View>
  );
}
