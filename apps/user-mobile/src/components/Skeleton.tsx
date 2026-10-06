import React, { useEffect, useRef } from "react";
import { Animated, StyleProp, View, ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Pulsing placeholder block for loading states (Figma Today 07). */
export function Skeleton({ width = "100%", height = 16, borderRadius = radius.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius, backgroundColor: colors.surfaceHigh, opacity }, style]}
    />
  );
}

/** A card-shaped skeleton: title line + body lines. */
export function SkeletonCard({ lines = 2, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessibilityLabel="Loading"
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          gap: spacing.sm,
        },
        style,
      ]}
    >
      <Skeleton width="45%" height={18} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "70%" : "100%"} height={12} />
      ))}
    </View>
  );
}
