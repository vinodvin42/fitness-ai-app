import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, IconName } from "./Icon";
import { colors, fonts, radius, spacing } from "../theme/tokens";

interface SelectCardProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading glyph shown in a soft well. */
  icon?: IconName;
}

/**
 * Single- or multi-select card (docs/mobile/04-design-system.md §5). 31 Aug
 * 2026 polish: an accent-tinted selected state with a checkmark, and an
 * optional leading icon well.
 */
export function SelectCard({ title, subtitle, selected, onPress, icon }: SelectCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ selected, checked: selected }}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {icon ? (
        <View style={[styles.iconWell, selected && styles.iconWellSelected]}>
          <Icon name={icon} size={20} color={selected ? colors.accent : colors.textSecondary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Icon name="check" size={14} color={colors.textOnAccent} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(79,125,243,0.22)",
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
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
});
