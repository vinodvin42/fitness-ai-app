import React from "react";
import { Text, View } from "react-native";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface AiUnavailableBannerProps {
  onRetry: () => void;
  retrying?: boolean;
}

/** Inline "AI temporarily unavailable" notice (Figma AI 02). The user's unsent draft stays in the composer. */
export function AiUnavailableBanner({ onRetry, retrying }: AiUnavailableBannerProps) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: spacing.md,
        marginBottom: spacing.sm,
        backgroundColor: colors.aiSurface,
        borderColor: colors.aiBorder,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Icon name="cloud-off" size={16} color={colors.aiAccent} />
        <Text style={{ color: colors.aiAccent, ...typography.h3, fontSize: 14 }}>Temporarily unavailable</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
        We couldn't get an answer right now. This is a temporary service issue, not your plan's usage limit. Your
        draft is still in the box below — retrying won't erase it.
      </Text>
      <Button label="Retry with this draft" onPress={onRetry} loading={retrying} style={{ height: 44 }} />
    </View>
  );
}
