import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

/** Card-based vertical scrolling — docs/coach/04-design-system.md §2. Copied near-verbatim from apps/user-mobile. */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
