import React, { useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import type { BodyMeasurement } from "@fitness-ai-app/types";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { MEASUREMENT_PARTS, changeArrow, measureDate, partHistory, trimLen, type MeasurementPartKey } from "../lib/measurementParts";
import { useMeasureUnits } from "../lib/measureUnits";
import { colors, fonts, layout, radius } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const CHART_POINTS = 8;
const LIST_PREVIEW = 4;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Figma progress/measure-03: one part's latest value and its change since the
 * compared date, its recent entries on a line chart, the logged entries, the
 * waist-to-height ratio (waist only, when your height is known) and how to
 * measure it.
 */
export function MeasurementPartSheet({
  part,
  rows,
  since,
  heightCm,
  onHowTo,
  onClose,
}: {
  part: MeasurementPartKey | null;
  rows: readonly BodyMeasurement[];
  /** The compared check ("since 24 Sep"); otherwise the previous entry of this part. */
  since?: BodyMeasurement | null;
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
  const sinceValue = def && since && latest && since.loggedAt < latest.at ? since[def.field] : null;
  const base =
    sinceValue != null && since
      ? { value: sinceValue, at: since.loggedAt }
      : history.length > 1
        ? history[history.length - 2]
        : null;
  const delta = latest && base ? units.len(latest.value) - units.len(base.value) : null;
  const len1 = (cm: number) => `${units.len(cm).toFixed(1)} ${units.lenUnit}`;
  const recent = history.slice(-CHART_POINTS);
  const newestFirst = [...history].reverse();
  const listed = showAll ? newestFirst : newestFirst.slice(0, LIST_PREVIEW);
  const chartW = Math.min(width, layout.maxContentWidth) - 20 * 2 - 14 * 2 - 2;
  const spanWeeks = recent.length > 1 ? Math.round((new Date(latest.at).getTime() - new Date(recent[0].at).getTime()) / (7 * DAY)) : 0;
  const plainName = def ? def.label.replace(/ [LR]$/, "").toLowerCase() : "";

  return (
    <BottomSheet visible={part !== null} onClose={onClose} title={def?.label ?? ""} closeIcon titleSize={24} gap={16} paddingX={20}>
      {!def || !latest ? (
        <>
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>Not measured yet. {def ? `${def.tip}.` : ""}</Text>
          <Button label="Done" onPress={onClose} />
        </>
      ) : (
        <>
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>
            {trimLen(units.len(latest.value))} {units.lenUnit} now
            {delta != null && base ? ` · ${changeArrow(delta) === "—" ? "no change" : changeArrow(delta)} since ${measureDate(base.at, "dm")}` : " · first log"}
          </Text>

          {recent.length > 1 ? (
            <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
                {spanWeeks >= 2 ? `Last ${spanWeeks} weeks` : `Last ${recent.length} entries`}
              </Text>
              <PartChart
                points={recent.map((p) => ({ at: p.at, value: units.len(p.value) }))}
                markAt={base?.at ?? null}
                width={chartW}
                accent={theme.accent}
                label={`${def.label} over ${recent.length} entries, from ${len1(recent[0].value)} to ${len1(latest.value)}`}
              />
            </View>
          ) : null}

          <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
            {listed.map((h, i) => (
              <View
                key={h.at}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>{measureDate(h.at, "day")}</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{len1(h.value)}</Text>
              </View>
            ))}
            {history.length > LIST_PREVIEW ? (
              <Pressable
                onPress={() => setShowAll((v) => !v)}
                accessibilityRole="button"
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>{showAll ? "Show fewer" : `See all ${history.length} entries`}</Text>
              </Pressable>
            ) : null}
          </View>

          {part === "waist" && heightCm ? (
            <View style={{ borderRadius: radius.md, backgroundColor: colors.surfaceRaised, paddingHorizontal: 14, paddingVertical: 10, gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 14 }}>Waist-to-height ratio</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{(latest.value / heightCm).toFixed(2)}</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 }}>
                Waist ÷ height ({units.heightText(heightCm)}). For information only.
              </Text>
            </View>
          ) : null}

          <Pressable onPress={() => onHowTo(part as MeasurementPartKey)} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>How to measure your {plainName}</Text>
          </Pressable>
          <Button label="Done" onPress={onClose} />
        </>
      )}
    </BottomSheet>
  );
}

/**
 * Figma measure-03 "line-chart": three dashed gridlines with values on the
 * left, the entries placed by date, the last point larger, and the first,
 * middle and last dates underneath. Height 118 like Figma.
 */
function PartChart({
  points,
  width,
  accent,
  label,
  markAt,
}: {
  points: Array<{ at: string; value: number }>;
  width: number;
  accent: string;
  label: string;
  /** The compared date (Figma labels it under the chart); else the middle point. */
  markAt: string | null;
}) {
  const H = 118;
  const left = 36;
  const right = Math.max(width - 12, left + 40);
  const top = 15.25;
  const bottom = 82.75;
  const vals = points.map((p) => p.value);
  let lo = Math.floor(Math.min(...vals));
  let hi = Math.ceil(Math.max(...vals));
  if (hi - lo < 2) {
    hi += 1;
    lo -= 1;
  }
  const mid = (hi + lo) / 2;
  const times = points.map((p) => new Date(p.at).getTime());
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const x = (t: number) => (t1 === t0 ? (left + right) / 2 : left + ((t - t0) / (t1 - t0)) * (right - left));
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (bottom - top);
  const marked = markAt ? points.findIndex((p) => p.at === markAt) : -1;
  const midIdx = marked > 0 && marked < points.length - 1 ? marked : Math.round((points.length - 1) / 2);
  const gridLabel = (v: number) => trimLen(v);

  return (
    <View accessible accessibilityLabel={label} style={{ width, height: H }}>
      <Svg width={width} height={H}>
        {[hi, mid, lo].map((v) => (
          <Line key={v} x1={30} x2={width - 6} y1={y(v)} y2={y(v)} stroke={colors.border} strokeWidth={1} strokeDasharray="3 3" />
        ))}
        <Polyline
          points={points.map((p, i) => `${x(times[i])},${y(p.value)}`).join(" ")}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const last = i === points.length - 1;
          return (
            <Circle key={p.at} cx={x(times[i])} cy={y(p.value)} r={last ? 4.75 : 3.75} fill={accent} stroke={colors.surface} strokeWidth={1.5} />
          );
        })}
      </Svg>
      {[hi, mid, lo].map((v) => (
        <Text key={`y${v}`} style={{ position: "absolute", left: 0, top: y(v) - 7, color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, letterSpacing: 1 }}>
          {gridLabel(v)}
        </Text>
      ))}
      <Text style={{ position: "absolute", left: 30, top: 102, color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, letterSpacing: 1 }}>
        {measureDate(points[0].at, "dm")}
      </Text>
      {points.length > 2 ? (
        <Text
          style={{
            position: "absolute",
            left: x(times[midIdx]) - 30,
            width: 60,
            textAlign: "center",
            top: 102,
            color: colors.textMuted,
            fontFamily: fonts.body,
            fontSize: 10,
            letterSpacing: 1,
          }}
        >
          {measureDate(points[midIdx].at, "dm")}
        </Text>
      ) : null}
      <Text style={{ position: "absolute", right: 0, top: 102, color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, letterSpacing: 1 }}>
        {measureDate(points[points.length - 1].at, "dm")}
      </Text>
    </View>
  );
}
