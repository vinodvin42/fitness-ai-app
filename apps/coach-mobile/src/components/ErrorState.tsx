import React from "react";
import { useTranslation } from "react-i18next";
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
export function ErrorState({ message, onRetry, style }: ErrorStateProps) {
  const { t } = useTranslation();
  // Resolved here rather than as a default parameter value: a default
  // would have to call `t` outside the component, where the hook is not
  // available and the language at module-load time would be frozen in.
  const body = message ?? t("common.checkConnection");
  return (
    <Card style={[{ alignItems: "center" }, style]}>
      <Text style={{ color: colors.textPrimary, ...typography.h2, textAlign: "center" }}>
        {t("common.somethingWentWrong")}
      </Text>
      <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }}>{body}</Text>
      {onRetry ? (
        <Button label={t("common.retry")} variant="secondary" onPress={onRetry} style={{ marginTop: spacing.md, minWidth: 140 }} />
      ) : null}
    </Card>
  );
}
