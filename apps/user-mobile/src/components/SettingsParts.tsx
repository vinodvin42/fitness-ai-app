import React from "react";
import { Pressable, Switch, Text, View, ViewStyle } from "react-native";
import { Icon, IconName } from "./Icon";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/** Small uppercase-ish section heading above a settings group (Figma Settings frames). */
export function SectionLabel({ text, style }: { text: string; style?: ViewStyle }) {
  return (
    <Text style={[{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.3, marginTop: spacing.sm }, style as object]}>
      {text}
    </Text>
  );
}

/** Rounded surface that stacks rows separated by hairlines. */
export function GroupCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
        style,
      ]}
    >
      {rows.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

interface ToggleRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  icon?: IconName;
  iconTint?: string;
  accessibilityLabel?: string;
}

export function ToggleRow({ title, subtitle, value, onValueChange, disabled, icon, iconTint, accessibilityLabel }: ToggleRowProps) {
  const { colors: theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 14, opacity: disabled ? 0.5 : 1 }}>
      {icon ? <Icon name={icon} size={18} color={iconTint ?? theme.accent} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 11, lineHeight: 15 }}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: theme.accent, false: colors.border }}
        accessibilityLabel={accessibilityLabel ?? title}
      />
    </View>
  );
}

interface ValueRowProps {
  title: string;
  subtitle?: string;
  /** Right-aligned accent value, e.g. "10 PM - 7 AM". */
  value?: string;
  onPress?: () => void;
}

export function ValueRow({ title, subtitle, value, onPress }: ValueRowProps) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 14 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 11 }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 13 }}>{value}</Text> : null}
    </Pressable>
  );
}

/** Full-width outlined action row (icon + label), e.g. "Download My Data". */
export function ActionRow({
  label,
  icon,
  onPress,
  tone = "neutral",
  loading,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  tone?: "neutral" | "danger";
  loading?: boolean;
}) {
  const color = tone === "danger" ? colors.danger : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        height: 48,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: tone === "danger" ? colors.danger : colors.border,
        backgroundColor: tone === "danger" ? colors.dangerSoft : colors.surface,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        opacity: loading ? 0.6 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={color} /> : null}
      <Text style={{ color, fontFamily: fonts.bodyBold, fontSize: 13 }}>{loading ? "Please wait..." : label}</Text>
    </Pressable>
  );
}
