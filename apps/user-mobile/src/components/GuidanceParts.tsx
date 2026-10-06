import React from "react";
import { Text, View } from "react-native";
import { Avatar } from "./Avatar";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/** Avatar + name + role line (Professional Guidance 05-08, 11). */
export function ProfessionalRow({ name, role }: { name: string; role: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Avatar name={name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{name}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{role}</Text>
      </View>
    </View>
  );
}

const STEP_LABELS = ["Requested", "Accepted", "Your approval", "Pay"];

/** Four-segment request progress: Requested -> Accepted -> Your approval -> Pay. `step` = segments filled (1-4). */
export function RequestStepBar({ step }: { step: number }) {
  const { colors: theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 4, now: step }}>
      {STEP_LABELS.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: i < step ? theme.accent : colors.border }} />
          <Text style={{ color: i < step ? colors.textSecondary : colors.textMuted, fontFamily: fonts.body, fontSize: 9 }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Surface card with a heading and label/value rows (Request summary, Accepted scope, ...). */
export function SummaryCard({
  title,
  rows,
  children,
  tone = "neutral",
}: {
  title?: string;
  rows?: Array<[string, string]>;
  children?: React.ReactNode;
  tone?: "neutral" | "accent" | "warning";
}) {
  const palette = {
    neutral: { bg: colors.surface, border: colors.border },
    accent: { bg: colors.infoSurface, border: colors.infoBorder },
    warning: { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.35)" },
  }[tone];
  return (
    <View style={{ backgroundColor: palette.bg, borderColor: palette.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 10 }}>
      {title ? <Text style={{ color: tone === "warning" ? colors.warning : colors.textPrimary, ...typography.h3, fontSize: 14 }}>{title}</Text> : null}
      {children}
      {(rows ?? []).map(([label, value]) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
          <Text style={{ color: colors.textPrimary, ...typography.label, flex: 1, textAlign: "right" }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function BodyText({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={{ color: muted ? colors.textMuted : colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>{children}</Text>;
}
