import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

interface SelectCardProps {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /** "checkbox" (default false = radio dot) — used for Service Selection, which is explicitly "not mutually exclusive" (docs/coach/03-screen-inventory.md §B), unlike apps/user-mobile's single-select uses of this component. */
  multiSelect?: boolean;
}

/** Select card — copied from apps/user-mobile, extended with an optional multiSelect (checkbox-style) indicator for Service Selection's not-mutually-exclusive cards. */
export function SelectCard({ title, subtitle, selected, onPress, multiSelect }: SelectCardProps) {
  return (
    <Pressable onPress={onPress} style={[styles.card, selected && styles.cardSelected]}>
      <View>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View
        style={[
          styles.radio,
          multiSelect && styles.checkbox,
          selected && (multiSelect ? styles.checkboxSelected : styles.radioSelected),
        ]}
      >
        {multiSelect && selected ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  titleSelected: {
    color: colors.accent,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkbox: {
    borderRadius: radius.sm / 2,
  },
  checkboxSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkmark: {
    color: "#0B0B0F",
    fontSize: 12,
    fontWeight: "700",
  },
});
