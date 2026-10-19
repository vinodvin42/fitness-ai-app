import React, { useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { BodyMeasurement } from "@fitness-ai-app/types";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { WeightGoalChart } from "./ProgressCharts";
import { MEASUREMENT_PARTS, partHistory, type MeasurementPartKey } from "../lib/measurementParts";
import { useMeasureUnits } from "../lib/measureUnits";
import { colors, fonts, layout, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const CHART_POINTS = 8;
const LIST_PREVIEW = 4;

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Figma progress/measure-03: one part's latest value, recent trend and logged entries. */
export function MeasurementPartSheet({
  part,
  rows,
  heightCm,
  onHowTo,
  onClose,
}: {
  part: MeasurementPartKey | null;
  rows: readonly BodyMeasurement[];
  /** From the onboarding profile; enables the waist-to-height line. */
  heightCm?: number | null;
  onHowTo: (part: MeasurementPartKey) => void;
  onClose: () => void;
}) {
  const units = useMeasureUnits();
  const { colors: theme } = useTheme();
  const { width } = useWindowDimensions();
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [part]);

  const def = part ? MEASUREMENT_PARTS[part] : null;
  const history = part ? partHistory(rows, part) : [];
  const latest = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : undefined;
  const delta = latest && previous ? units.len(latest.value) - units.len(previous.value) : null;
  const len = (cm: number) => `${units.len(cm).toFixed(1)} ${units.lenUnit}`;
  const recent = history.slice(-CHART_POINTS);
  const newestFirst = [...history].reverse();
  const listed = showAll ? newestFirst : newestFirst.slice(0, LIST_PREVIEW);
  const chartW = Math.min(width, layout.maxContentWidth) - spacing.md * 2 - spacing.md * 2;

  return (
    <BottomSheet visible={part !== null} onClose={onClose} title={def?.label ?? ""} closeIcon>
      {!def || !latest ? (
        <>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>
            Not measured yet. {def ? `${def.tip}.` : ""}
          </Text>
          <Button label="Done" onPress={onClose} />
        </>
      ) : (
        <>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>
            {len(latest.value)} now
            {delta != null && previous
              ? ` · ${delta === 0 ? "no change" : `${delta < 0 ? "↓" : "↑"}${Math.abs(delta).toFixed(1)}`} since ${dayMonth(previous.at)}`
              : " · first log"}
          </Text>

          {recent.length > 1 ? (
            <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs }}>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>Last {recent.length} entries</Text>
              <WeightGoalChart
                points={recent.map((p) => ({ at: p.at, value: units.len(p.value) }))}
                goal={null}
                width={chartW}
                height={110}
                accessibilityLabel={`${def.label} over your last ${recent.length} entries, from ${len(recent[0].value)} to ${len(latest.value)}`}
              />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dayMonth(recent[0].at)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{dayMonth(latest.at)}</Text>
              </View>
            </View>
          ) : null}

          <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            {listed.map((h, i) => (
              <View
                key={h.at}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingHorizontal: spacing.md,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{shortDate(h.at)}</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{len(h.value)}</Text>
              </View>
            ))}
            {history.length > LIST_PREVIEW ? (
              <Pressable
                onPress={() => setShowAll((v) => !v)}
                accessibilityRole="button"
                style={{ paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <Text style={{ color: theme.accentText, ...typography.label, fontSize: 13 }}>
                  {showAll ? "Show fewer" : `See all ${history.length} entries`}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {part === "waist" && heightCm ? (
            <View style={{ borderRadius: radius.md, backgroundColor: colors.surfaceRaised, padding: spacing.md, gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>Waist-to-height ratio</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{(latest.value / heightCm).toFixed(2)}</Text>
              </View>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                Waist ÷ height ({units.heightText(heightCm)}). For information only.
              </Text>
            </View>
          ) : null}

          <Pressable onPress={() => onHowTo(part as MeasurementPartKey)} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: theme.accentText, ...typography.label, fontSize: 13 }}>
              How to measure your {def.label.replace(/ [LR]$/, "").toLowerCase()}
            </Text>
          </Pressable>
          <Button label="Done" onPress={onClose} />
        </>
      )}
    </BottomSheet>
  );
}
