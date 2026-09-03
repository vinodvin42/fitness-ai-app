import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../theme/tokens";

interface ProgressRingProps {
  /** 0–1 fill fraction (clamped). */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Centered content (a value + label). */
  children?: React.ReactNode;
}

/**
 * Circular value/goal ring (docs/mobile/04-design-system.md §4 — "one shared
 * ProgressRing component, not rebuilt per screen"). Added 31 Aug 2026.
 */
export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 12,
  color = colors.accent,
  trackColor = colors.border,
  children,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </Svg>
      {children}
    </View>
  );
}
