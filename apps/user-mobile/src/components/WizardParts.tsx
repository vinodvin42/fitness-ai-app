import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, IconName } from "./Icon";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/**
 * Selection cards used by the Figma "01 Onboarding" frames. The option rows
 * are "solid when selected": the whole card fills with the accent colour.
 */

interface OptionRowProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /** Leading glyph in a rounded well (About You gender cards). */
  icon?: IconName;
  /** Trailing control: an empty radio (diet), a checkbox that becomes a tick (conditions), or nothing (gender). */
  trailing?: "radio" | "checkbox" | "none";
  accessibilityRole?: "radio" | "checkbox";
  /** Compact padding for dense lists. */
  dense?: boolean;
}

export function OptionRow({ title, subtitle, selected, onPress, icon, trailing = "none", accessibilityRole = "radio", dense }: OptionRowProps) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ selected, checked: selected }}
      style={[styles.row, dense && styles.rowDense, selected && { backgroundColor: theme.accent, borderColor: theme.accent }]}
    >
      {icon ? (
        <View style={[styles.well, selected && styles.wellSelected]}>
          <Icon name={icon} size={18} color={selected ? theme.textOnAccent : colors.textSecondary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: selected ? theme.textOnAccent : colors.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSubtitle, selected && { color: "rgba(255,255,255,0.7)" }]}>{subtitle}</Text> : null}
      </View>
      {trailing === "radio" ? <View style={[styles.radio, selected && { borderColor: "transparent" }]} /> : null}
      {trailing === "checkbox" ? (
        selected ? <Icon name="check" size={16} color={theme.textOnAccent} strokeWidth={3} /> : <View style={styles.checkbox} />
      ) : null}
    </Pressable>
  );
}

interface LevelCardProps {
  title: string;
  tag: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}

/** Figma fitness-level card: left rail, bold title + small accent tag, then a muted description. */
export function LevelCard({ title, tag, description, selected, onPress }: LevelCardProps) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${title}, ${tag}, ${description}`}
      accessibilityState={{ selected, checked: selected }}
      style={[styles.level, selected && { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
    >
      <View style={[styles.rail, selected && { backgroundColor: theme.accent }]} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <Text style={styles.levelTitle}>{title}</Text>
          <Text style={[styles.levelTag, { color: theme.accent }]}>{tag}</Text>
        </View>
        <Text style={styles.levelDesc}>{description}</Text>
      </View>
    </Pressable>
  );
}

/** Square checkbox with a content block beside it, for the consent card. */
export function CheckboxField({
  checked,
  onChange,
  children,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  label: string;
}) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start" }}
    >
      <View style={[styles.checkbox, { marginTop: 2 }, checked && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        {checked ? <Icon name="check" size={14} color={theme.textOnAccent} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowDense: { paddingVertical: 11, minHeight: 48 },
  rowTitle: { fontSize: 14, fontFamily: fonts.bodySemi },
  rowSubtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  well: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  wellSelected: { backgroundColor: "rgba(255,255,255,0.14)" },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderStrong },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  level: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rail: { width: 3, borderRadius: 2, backgroundColor: colors.surfaceHigh },
  levelTitle: { ...typography.h3, fontSize: 15, color: colors.textPrimary },
  levelTag: { fontSize: 11, fontFamily: fonts.bodyMedium },
  levelDesc: { fontSize: 12, fontFamily: fonts.body, color: colors.textSecondary },
});
