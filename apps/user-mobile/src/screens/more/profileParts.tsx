import React from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Icon, IconName } from "../../components/Icon";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";

/**
 * Shared pieces for the Profile & Settings frames (Figma section 11): grouped
 * row cards, small caps group headers, switches and the two-option unit
 * toggles. The page shell itself is `RecoverShell` (centered, circular back).
 */

/** Small caps group header, e.g. "DISPLAY & THEME". */
export function GroupHeader({ children, upper = true }: { children: string; upper?: boolean }) {
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontFamily: fonts.bodySemi,
        fontSize: 11,
        letterSpacing: 0.8,
        marginTop: spacing.xs,
      }}
    >
      {upper ? children.toUpperCase() : children}
    </Text>
  );
}

/** Rounded card holding rows separated by hairlines. */
export function RowGroup({ children }: { children: React.ReactNode }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      {rows.map((row, i) => (
        <View key={i} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
          {row}
        </View>
      ))}
    </View>
  );
}

interface SettingRowProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** Right-aligned muted value (e.g. "Dark"). */
  value?: string;
  /** Replaces the value/chevron (a Switch, a Pill, ...). */
  right?: React.ReactNode;
  onPress?: () => void;
  tint?: string;
  disabled?: boolean;
  danger?: boolean;
}

export function SettingRow({ icon, title, subtitle, value, right, onPress, tint, disabled, danger }: SettingRowProps) {
  const color = danger ? colors.danger : tint ?? colors.textSecondary;
  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: 14,
        paddingVertical: 13,
        minHeight: 52,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={18} color={color} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? colors.danger : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right !== undefined ? (
        right
      ) : (
        <>
          {value ? (
            <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 12, maxWidth: 150 }} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {onPress ? <Icon name="chevron-right" size={16} color={colors.textMuted} /> : null}
        </>
      )}
    </View>
  );
  return onPress && !disabled ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** A SettingRow with a Switch on the right. */
export function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow
      icon={icon}
      title={title}
      subtitle={subtitle}
      disabled={disabled}
      right={<AppSwitch value={value} onValueChange={onValueChange} disabled={disabled} label={title} />}
    />
  );
}

export function AppSwitch({
  value,
  onValueChange,
  disabled,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  const { colors: theme } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: theme.accent, false: colors.surfaceHigh }}
      thumbColor="#FFFFFF"
      // react-native-web only: keep the "on" thumb white instead of its default tint.
      {...({ activeThumbColor: "#FFFFFF" } as object)}
      accessibilityLabel={label}
    />
  );
}

/** Two-option unit toggle (kg | lbs). */
export function UnitToggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { colors: theme } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, padding: 3, gap: 2 }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label} ${o.label}`}
            style={{
              minWidth: 58,
              alignItems: "center",
              paddingVertical: 7,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.xs + 2,
              backgroundColor: selected ? theme.accent : "transparent",
            }}
          >
            <Text style={{ color: selected ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-width destructive text row (Log Out, Remove code). */
export function TextAction({ label, onPress, danger, accent }: { label: string; onPress: () => void; danger?: boolean; accent?: boolean }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ alignItems: "center", paddingVertical: spacing.sm + 2 }}
    >
      <Text
        style={{
          color: danger ? colors.danger : accent ? theme.accent : colors.textPrimary,
          fontFamily: fonts.bodySemi,
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Bordered outline button used for secondary actions in these frames. */
export function OutlineButton({ label, onPress, danger, disabled, icon }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        height: 46,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: danger ? colors.danger : colors.border,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={danger ? colors.danger : colors.textPrimary} /> : null}
      <Text style={{ color: danger ? colors.danger : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
