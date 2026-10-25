import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, fonts, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/** The one style for a section title on a screen (design consistency pass, 25 Oct 2026). */
export const sectionTitleStyle = {
  fontFamily: fonts.displayBold,
  fontSize: 18,
  lineHeight: 24,
  letterSpacing: -0.2,
} as const;

/** Section title with an optional link on the right ("See all ›"). */
export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  const { colors: theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.xs }}>
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...sectionTitleStyle, flexShrink: 1 }}>
        {title}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label} hitSlop={8}>
          <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small uppercase label above a card's title ("YOUR NEXT ACTION"). */
export function Eyebrow({ children, color }: { children: string; color?: string }) {
  return (
    <Text style={{ color: color ?? colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>
      {children}
    </Text>
  );
}
