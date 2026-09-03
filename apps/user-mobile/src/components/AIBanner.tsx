import React from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface AIBannerProps {
  title: string;
  body: string;
  ctaLabel?: string;
  onPress?: () => void;
}

/**
 * AI insight/coach banner (docs/mobile/04-design-system.md §5 "AI banner/
 * card") — the recurring purple-accented AI touchpoint (daily brief, recovery
 * insight, coach entry). Added 31 Aug 2026. Uses the dedicated AI accent so
 * AI surfaces read distinctly from the app's primary accent (§2).
 */
export function AIBanner({ title, body, ctaLabel, onPress }: AIBannerProps) {
  const content = (
    <View
      style={{
        backgroundColor: colors.aiAccentSoft,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: "rgba(168,85,247,0.35)",
        padding: spacing.md,
        flexDirection: "row",
        gap: spacing.md,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.sm,
          backgroundColor: "rgba(168,85,247,0.25)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="sparkles" size={20} color={colors.aiAccent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{body}</Text>
        {ctaLabel ? (
          <Text style={{ color: colors.aiAccent, ...typography.label, marginTop: spacing.sm }}>{ctaLabel} ›</Text>
        ) : null}
      </View>
      {onPress && !ctaLabel ? <Icon name="chevron-right" size={20} color={colors.aiAccent} /> : null}
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}
