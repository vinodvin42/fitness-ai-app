import React from "react";
import { Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { MEASUREMENT_PARTS, type MeasurementPartKey } from "../lib/measurementParts";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const HABITS = [
  "Same time of day, ideally in the morning before food",
  "Stand relaxed and breathe out normally",
  "Keep the tape level and snug, not tight",
];

const DEFAULT_PARTS: MeasurementPartKey[] = ["chest", "waist", "hips"];

/** Figma progress/measure-06: consistent-measuring habits and where to put the tape. */
export function HowToMeasureSheet({
  visible,
  focus,
  onClose,
}: {
  visible: boolean;
  /** A part to explain first (from its history sheet); otherwise chest, waist and hips. */
  focus?: MeasurementPartKey | null;
  onClose: () => void;
}) {
  const { colors: theme } = useTheme();
  const parts = focus && !DEFAULT_PARTS.includes(focus) ? [focus, ...DEFAULT_PARTS.slice(0, 2)] : DEFAULT_PARTS;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="How to measure" closeIcon>
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>Small habits make each check easy to compare.</Text>
      {HABITS.map((h, i) => (
        <View key={h} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodyBold, fontSize: 13 }}>{i + 1}</Text>
          </View>
          <Text style={{ flex: 1, color: colors.textPrimary, ...typography.body, fontSize: 14 }}>{h}</Text>
        </View>
      ))}
      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        {parts.map((k) => {
          const p = MEASUREMENT_PARTS[k];
          return (
            <View
              key={k}
              style={{
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: k === focus ? theme.accent : colors.border,
                padding: spacing.sm + 2,
                gap: 2,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{p.label.replace(/ [LR]$/, "")}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{p.tip}</Text>
            </View>
          );
        })}
      </View>
      <Button label="Got it" onPress={onClose} style={{ marginTop: spacing.sm }} />
    </BottomSheet>
  );
}
