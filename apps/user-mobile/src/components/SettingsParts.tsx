import React from "react";
import { Platform, Pressable, Switch, Text, View, ViewStyle } from "react-native";
import { FocusRing, useFocusState } from "./FocusRing";
import { Icon, IconName } from "./Icon";
import { colors, fonts, radius, spacing, typography, touch } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/** Small uppercase-ish section heading above a settings group (Figma Settings frames). */
export function SectionLabel({ text, style }: { text: string; style?: ViewStyle }) {
  return (
    <Text style={[{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.3, marginTop: spacing.sm }, style as object]}>
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
  const { focused, focusProps } = useFocusState();
  // The whole row is the control (bigger target than the 51x31 switch); the
  // Switch itself is hidden from screen readers so it is announced once.
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      android_ripple={{ color: colors.ripple }}
      {...focusProps}
      style={({ pressed }: { pressed: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 14, minHeight: touch.min, opacity: pressed && !disabled ? 0.85 : 1 })}
    >
      <FocusRing visible={focused} radius={radius.sm} offset={-3} />
      {icon ? <Icon name={icon} size={18} color={disabled ? colors.textMuted : iconTint ?? theme.accent} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        {/* Disabled dims the title and the switch only; the subtitle usually says why, so it stays readable. */}
        <Text style={{ color: disabled ? colors.textMuted : colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text> : null}
      </View>
      <Switch
        style={disabled ? { opacity: 0.45 } : undefined}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: theme.accent, false: colors.outline }}
        thumbColor={Platform.OS === "android" ? (value ? theme.textOnAccent : colors.surface) : undefined}
        ios_backgroundColor={colors.outline}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
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
      android_ripple={onPress ? { color: colors.ripple } : undefined}
      style={({ pressed }: { pressed: boolean }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 14, minHeight: touch.min, opacity: pressed && onPress ? 0.85 : 1 })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={{ color: theme.accentText, fontFamily: fonts.bodyBold, fontSize: 13 }}>{value}</Text> : null}
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
  const color = tone === "danger" ? colors.dangerText : colors.textPrimary;
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
