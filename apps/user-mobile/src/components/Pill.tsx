import React from "react";
import { Text, View } from "react-native";
import { Icon, IconName } from "./Icon";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "ai";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceHigh, fg: colors.textSecondary },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  ai: { bg: colors.aiAccentSoft, fg: colors.aiAccent },
};

interface PillProps {
  label: string;
  tone?: Tone;
  icon?: IconName;
}

/** Small rounded badge/meta-chip (docs/mobile/04-design-system.md §5). Added 31 Aug 2026. */
export function Pill({ label, tone = "neutral", icon }: PillProps) {
  const t = TONES[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        backgroundColor: t.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
      }}
    >
      {icon ? <Icon name={icon} size={12} color={t.fg} strokeWidth={2.5} /> : null}
      <Text style={{ color: t.fg, ...typography.caption, fontFamily: fonts.bodyBold }}>{label}</Text>
    </View>
  );
}
