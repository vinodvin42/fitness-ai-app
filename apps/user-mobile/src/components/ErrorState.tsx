import React from "react";
import { useTranslation } from "react-i18next";
import { StyleProp, Text, ViewStyle } from "react-native";
import { Card } from "./Card";
import { Button } from "./Button";
import { colors, spacing, typography } from "../theme/tokens";

interface ErrorStateProps {
  message?: string;
  /** Wired to the query's own `refetch()` wherever this is used — a real retry, not a decorative button. */
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared error-state block for a failed data fetch — part of the
 * cross-cutting workstream flagged in docs/platform/roadmap.md: "Empty/
 * loading/error states per screen (none exist in either Figma file)."
 * Every screen in this app that reads from the network previously either
 * showed an infinite spinner or silently rendered nothing on a failed
 * request, with no way for the user to recover short of force-quitting.
 * This gives every one of them a real "something went wrong" message and
 * a Retry button wired to React Query's `refetch`, so it's a genuine
 * retry — not a fake control that re-renders the same failed state.
 */
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
        <Button
          label={t("common.retry")}
          variant="secondary"
          onPress={onRetry}
          style={{ marginTop: spacing.md, minWidth: 140 }}
        />
      ) : null}
    </Card>
  );
}
