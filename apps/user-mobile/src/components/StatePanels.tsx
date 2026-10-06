import React from "react";
import { Pressable, ScrollView, StyleProp, Text, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, IconName } from "./Icon";
import { colors, layout, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

export type PanelTone = "neutral" | "accent" | "ai" | "danger";

interface InfoCardProps {
  title: string;
  body: string;
  tone?: PanelTone;
  style?: StyleProp<ViewStyle>;
}

/** Small tinted detail card used by permission / unavailable / reasoning screens (Figma "Detail card"). */
export function InfoCard({ title, body, tone = "neutral", style }: InfoCardProps) {
  const { colors: theme } = useTheme();
  const palette = {
    neutral: { bg: colors.surface, border: colors.border, title: colors.textPrimary },
    accent: { bg: colors.infoSurface, border: colors.infoBorder, title: theme.accent },
    ai: { bg: colors.aiSurface, border: colors.aiBorder, title: colors.aiAccent },
    danger: { bg: colors.surface, border: colors.danger, title: colors.danger },
  }[tone];
  return (
    <View
      style={[
        { backgroundColor: palette.bg, borderColor: palette.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 10 },
        style,
      ]}
    >
      <Text style={{ color: palette.title, ...typography.h3, fontSize: 14 }}>{title}</Text>
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>{body}</Text>
    </View>
  );
}

interface StateAction {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
}

interface StateLayoutProps {
  /** Small coloured line above the title, e.g. "Permissions / Notifications". */
  flowLabel: string;
  flowIcon: IconName;
  flowTone?: "accent" | "ai";
  title: string;
  description: string;
  children?: React.ReactNode;
  /** Muted helper line directly above the action buttons. */
  footnote?: string;
  actions: StateAction[];
  onBack?: () => void;
}

/**
 * Full-screen "state" layout shared by the permission-denied screens (Figma
 * Fuel 09/10, Settings 13) and AI unavailable (AI 02): back chip, flow label,
 * big title, description, detail cards, then pinned primary/secondary actions.
 */
export function StateLayout({ flowLabel, flowIcon, flowTone = "accent", title, description, children, footnote, actions, onBack }: StateLayoutProps) {
  const { colors: theme } = useTheme();
  const tint = flowTone === "ai" ? colors.aiAccent : theme.accent;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={{
          width: "100%",
          maxWidth: layout.maxContentWidth,
          alignSelf: "center",
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          gap: 18,
        }}
      >
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="chevron-left" size={18} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Icon name={flowIcon} size={18} color={tint} />
            <Text style={{ color: tint, ...typography.label, fontSize: 11, letterSpacing: 0.7 }}>{flowLabel}</Text>
          </View>
          <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h1, fontSize: 24, lineHeight: 28 }}>
            {title}
          </Text>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>{description}</Text>
        </View>
        {children}
      </ScrollView>
      <View
        style={{
          width: "100%",
          maxWidth: layout.maxContentWidth,
          alignSelf: "center",
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          gap: 10,
        }}
      >
        {footnote ? (
          <Text style={{ color: colors.textSecondary, ...typography.meta, textAlign: "center" }}>{footnote}</Text>
        ) : null}
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            disabled={a.disabled || a.loading}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            accessibilityState={{ disabled: !!a.disabled, busy: !!a.loading }}
            style={{
              height: 52,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: a.variant === "secondary" ? colors.surface : theme.accent,
              borderWidth: a.variant === "secondary" ? 1 : 0,
              borderColor: colors.border,
              opacity: a.disabled || a.loading ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: a.variant === "secondary" ? colors.textPrimary : theme.textOnAccent,
                ...typography.h3,
                fontSize: 15,
              }}
            >
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
