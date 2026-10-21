import React from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { FigmaArt, measureSvg } from "./MeasureUi";
import { MEASUREMENT_PARTS, type MeasurementPartKey } from "../lib/measurementParts";
import { colors, fonts, radius } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const HABITS = [
  "Same time of day, ideally morning before food",
  "Stand relaxed and breathe out normally",
  "Keep the tape level and snug, not tight",
];

/** Figma measure-06 "mini-diagrams": where the tape goes on chest, waist and hips. */
const DIAGRAMS = [
  { key: "chest", title: "Chest", caption: "Under the arms", svg: "miniChest" },
  { key: "waist", title: "Waist", caption: "At belly button", svg: "miniWaist" },
  { key: "hips", title: "Hips", caption: "Widest part", svg: "miniHips" },
] as const;

/**
 * Figma progress/measure-06: consistent-measuring habits and where to put the
 * tape. Opened from another part's sheet, that part's tip is shown too.
 * "Learn more" appears only when the screen has somewhere to send you.
 */
export function HowToMeasureSheet({
  visible,
  focus,
  onClose,
  onLearnMore,
}: {
  visible: boolean;
  /** The part whose sheet opened this one. */
  focus?: MeasurementPartKey | null;
  onClose: () => void;
  onLearnMore?: () => void;
}) {
  const { colors: theme } = useTheme();
  const extra = focus && !DIAGRAMS.some((d) => d.key === focus) ? MEASUREMENT_PARTS[focus] : null;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="How to measure" closeIcon titleSize={24} gap={16} paddingX={20}>
      <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>Small habits make each check easy to compare.</Text>
      <View style={{ gap: 10 }}>
        {HABITS.map((h, i) => (
          <View key={h} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 12 }}>{i + 1}</Text>
            </View>
            <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 14 }}>{h}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {DIAGRAMS.map((d) => (
          <View
            key={d.key}
            accessible
            accessibilityLabel={`${d.title}: ${d.caption}`}
            style={{
              flex: 1,
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 6,
              paddingVertical: 10,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: d.key === focus ? theme.accent : colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <FigmaArt svg={measureSvg(d.svg)} />
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{d.title}</Text>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, textAlign: "center" }}>{d.caption}</Text>
          </View>
        ))}
      </View>
      {extra ? (
        <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: theme.accent, paddingHorizontal: 14, paddingVertical: 10, gap: 2 }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{extra.label.replace(/ [LR]$/, "")}</Text>
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 }}>{extra.tip}</Text>
        </View>
      ) : null}
      {onLearnMore ? (
        <Pressable onPress={onLearnMore} accessibilityRole="link" hitSlop={6}>
          <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Learn more</Text>
        </Pressable>
      ) : null}
      <Button label="Got it" onPress={onClose} />
    </BottomSheet>
  );
}
