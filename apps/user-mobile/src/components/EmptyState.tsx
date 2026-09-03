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

/**
 * Shared empty-state block — for a successfully loaded list that's
 * genuinely empty, as opposed to ErrorState (a failed fetch). Same
 * cross-cutting gap as ErrorState (see its doc comment): neither Figma
 * file specifies empty states, so every list screen previously either
 * showed nothing or an ad-hoc, inconsistently-styled one-line message.
 * This gives every list a consistent title + optional subtitle +
 * optional real action (e.g. "Add a Reminder" navigating straight to the
 * form that creates the first one), not just a passive message.
 */
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
