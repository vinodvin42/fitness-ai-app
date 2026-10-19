import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { colors, elevation, radius, spacing, themed } from "../theme/tokens";

/**
 * Card-based vertical scrolling is the dominant mobile layout —
 * docs/mobile/04-design-system.md §4. 31 Aug 2026: gained soft elevation +
 * a more generous radius as part of the design polish pass.
 */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
}));
