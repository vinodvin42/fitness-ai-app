import React from "react";
import { Text, View } from "react-native";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/**
 * Building blocks of the Professional Guidance screens (Figma section 09; 25 Oct 2026): the flow
 * label and heading, the professional row, the four-step request bar and the detail cards.
 */

/** "Professional Guidance / Request pending" with its icon, above a state heading. */
export function FlowLabel({ icon, label, tone = "accent" }: { icon: IconName; label: string; tone?: "accent" | "muted" }) {
  const { colors: theme } = useTheme();
  const color = tone === "accent" ? theme.accentText : colors.textSecondary;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Icon name={icon} size={18} color={color} />
      <Text style={{ flex: 1, color, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.7 }}>{label}</Text>
    </View>
  );
}

/** Flow label, a 24 px title and a line of context (top of every request state). */
export function StateHeading({ icon, flow, title, body, tone }: { icon: IconName; flow: string; title: string; body?: string; tone?: "accent" | "muted" }) {
  return (
    <View style={{ gap: 10 }}>
      <FlowLabel icon={icon} label={flow} tone={tone} />
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 28, letterSpacing: -0.5 }}>
        {title}
      </Text>
      {body ? <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{body}</Text> : null}
    </View>
  );
}

/** Avatar + name + role line (Professional Guidance 05-08, 11). */
export function ProfessionalRow({ name, role, size = 54 }: { name: string; role: string; size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <Avatar name={name} size={size} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{name}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{role}</Text>
      </View>
    </View>
  );
}

const STEP_LABELS = ["Requested", "Accepted", "Pay", "Booked"];

/** Four-segment request progress (Figma coach/05, 07): Requested -> Accepted -> Pay -> Booked. `step` = segments filled (0-4). */
export function RequestStepBar({ step }: { step: number }) {
  const { colors: theme } = useTheme();
  return (
    <View
      style={{ flexDirection: "row", gap: spacing.sm }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${Math.max(step, 1)} of 4: ${STEP_LABELS[Math.max(step, 1) - 1]}`}
      accessibilityValue={{ min: 0, max: 4, now: step }}
    >
      {STEP_LABELS.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 7 }}>
          <View style={{ height: 3, borderRadius: 3, backgroundColor: i < step ? theme.accent : colors.surfaceHigh }} />
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/** One label / value line in a detail card: the label column is 104 wide, the value wraps beside it. */
export function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: "row", gap: spacing.md }}>
      <Text style={{ width: 104, color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>{label}</Text>
      <Text selectable style={{ flex: 1, color: valueColor ?? colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 }}>
        {value}
      </Text>
    </View>
  );
}

/** Surface card with a heading and label/value rows (Request summary, Accepted scope, ...). The accent tone is the blue info card. */
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
  const { colors: theme } = useTheme();
  const palette = {
    neutral: { bg: colors.surface, border: colors.border, title: colors.textPrimary },
    accent: { bg: colors.infoSurface, border: colors.infoBorder, title: theme.accentText },
    warning: { bg: colors.warningSoft, border: colors.warning, title: colors.warningText },
  }[tone];
  return (
    <View style={{ backgroundColor: palette.bg, borderColor: palette.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 10 }}>
      {title ? <Text style={{ color: palette.title, fontFamily: fonts.bodySemi, fontSize: 14 }}>{title}</Text> : null}
      {children}
      {(rows ?? []).map(([label, value]) => (
        <DetailRow key={label} label={label} value={value} />
      ))}
    </View>
  );
}

export function BodyText({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={{ color: muted ? colors.textMuted : colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>{children}</Text>;
}
