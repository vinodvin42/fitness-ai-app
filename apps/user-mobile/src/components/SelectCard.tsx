import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, IconName } from "./Icon";
import { FocusRing, useFocusState } from "./FocusRing";
import { colors, fonts, radius, spacing, themed } from "../theme/tokens";

interface SelectCardProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading glyph shown in a soft well. */
  icon?: IconName;
  disabled?: boolean;
}

/**
 * Single- or multi-select card (docs/mobile/04-design-system.md §5). 31 Aug
 * 2026 polish: an accent-tinted selected state with a checkmark, and an
 * optional leading icon well.
 */
export function SelectCard({ title, subtitle, selected, onPress, icon, disabled }: SelectCardProps) {
  const { focused, focusProps } = useFocusState();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ selected, checked: selected, disabled: !!disabled }}
      disabled={disabled}
      {...focusProps}
      android_ripple={{ color: colors.ripple }}
      style={({ pressed }: { pressed: boolean }) => [styles.card, selected && styles.cardSelected, pressed && !disabled && { opacity: 0.88 }, disabled && styles.cardDisabled]}
    >
      <FocusRing visible={focused} radius={radius.card} />
      {icon ? (
        <View style={[styles.iconWell, selected && styles.iconWellSelected, disabled && { opacity: 0.45 }]}>
          <Icon name={icon} size={20} color={selected ? colors.accentText : colors.textSecondary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {/* Disabled dims title, icon and radio; the subtitle often explains why, so it stays readable. */}
        <Text style={[styles.title, selected && styles.titleSelected, disabled && { color: colors.textMuted }]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected, disabled && { opacity: 0.45 }]}>
        {selected ? <Icon name="check" size={14} color={colors.textOnAccent} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardDisabled: {
    backgroundColor: "transparent",
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWellSelected: {
    backgroundColor: colors.accentSoft,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: fonts.bodySemi,
  },
  titleSelected: {
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
}));
