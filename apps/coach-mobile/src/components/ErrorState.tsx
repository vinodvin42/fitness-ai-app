import React from "react";
import { StyleProp, Text, ViewStyle } from "react-native";
import { Card } from "./Card";
import { Button } from "./Button";
import { colors, spacing, typography } from "../theme/tokens";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Shared error-state block for a failed data fetch — copied near-verbatim from apps/user-mobile. */
export function ErrorState({
  message = "Couldn't load this. Check your connection and try again.",
  onRetry,
  style,
}: ErrorStateProps) {
  return (
    <Card style={[{ alignItems: "center" }, style]}>
      <Text style={{ color: colors.textPrimary, ...typography.h2, textAlign: "center" }}>Something went wrong</Text>
      <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }}>{message}</Text>
      {onRetry ? (
        <Button label="Retry" variant="secondary" onPress={onRetry} style={{ marginTop: spacing.md, minWidth: 140 }} />
      ) : null}
    </Card>
  );
}
