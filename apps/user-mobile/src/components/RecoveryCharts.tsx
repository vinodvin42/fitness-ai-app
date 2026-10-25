import React from "react";
import { Text, View } from "react-native";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { colors, fonts, themed } from "../theme/tokens";
import type { Stages } from "../lib/sleepStats";
import { hm, stageShares } from "../lib/sleepStats";

/**
 * Small charts for Recovery's sleep and trend views (owner, 25 Oct 2026).
 * Same approach as components/Charts.tsx: react-native-svg, and each chart is
 * one accessible element whose label says what it shows.
 */

export const STAGE_COLORS = themed(() => ({
  awake: colors.warning,
  light: colors.accent,
  deep: colors.aiAccent,
  rem: colors.cyan,
}));

const STAGE_LABEL: Record<keyof Stages, string> = { awake: "Awake", light: "Light", deep: "Deep", rem: "REM" };
const STAGE_ORDER: Array<keyof Stages> = ["awake", "light", "deep", "rem"];

/** One night's stages as a single stacked bar. */
export function StageBar({ stages, height = 12 }: { stages: Stages; height?: number }) {
  const total = STAGE_ORDER.reduce((s, k) => s + stages[k], 0);
  if (total <= 0) return null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Sleep stages: ${STAGE_ORDER.map((k) => `${STAGE_LABEL[k]} ${hm(stages[k])}`).join(", ")}`}
      style={{ flexDirection: "row", height, borderRadius: height / 2, overflow: "hidden", backgroundColor: colors.surfaceHigh }}
    >
      {STAGE_ORDER.map((k) =>
        stages[k] > 0 ? <View key={k} style={{ flex: stages[k], backgroundColor: STAGE_COLORS[k] }} /> : null,
      )}
    </View>
  );
}

/** Minutes per stage, with each sleep stage's share of time asleep. */
export function StageLegend({ stages }: { stages: Stages }) {
  const shares = stageShares(stages);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
      {STAGE_ORDER.map((k) => (
        <View key={k} style={{ width: "50%", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STAGE_COLORS[k] }} />
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{STAGE_LABEL[k]}</Text>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
            {hm(stages[k])}
            {k !== "awake" && shares ? ` · ${shares[k]}%` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

const PAD = { top: 10, right: 8, bottom: 20, left: 8 };

/** Hours slept per night as bars, with the sleep need as a dashed line. Nights at the need are full colour. */
export function SleepBars({
  nights,
  needHours,
  width,
  height = 150,
}: {
  nights: Array<{ label: string; hours: number }>;
  needHours: number;
  width: number;
  height?: number;
}) {
  if (nights.length === 0) return null;
  const max = Math.max(needHours + 1, ...nights.map((n) => n.hours));
  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const slot = w / nights.length;
  const barW = Math.max(3, Math.min(24, slot * 0.6));
  const base = PAD.top + h;
  const y = (v: number) => base - (v / max) * h;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Hours slept per night against a ${needHours}-hour need. ${nights.map((n) => `${n.label} ${hm(n.hours * 60)}`).join(", ")}`}
    >
      <Svg width={width} height={height}>
        <Line x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} stroke={colors.border} strokeWidth={1} />
        {nights.map((n, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const met = n.hours >= needHours - 1 / 60;
          return (
            <G key={i}>
              <Rect
                x={cx - barW / 2}
                y={y(n.hours)}
                width={barW}
                height={Math.max(2, base - y(n.hours))}
                rx={Math.min(4, barW / 2)}
                fill={colors.accent}
                opacity={met ? 1 : 0.55}
              />
              {n.label ? (
                <SvgText x={cx} y={height - 5} fill={colors.textMuted} fontSize={10} fontFamily={fonts.body} textAnchor="middle">
                  {n.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        <Line x1={PAD.left} x2={width - PAD.right} y1={y(needHours)} y2={y(needHours)} stroke={colors.success} strokeWidth={1.5} strokeDasharray="5,4" />
        <SvgText x={width - PAD.right} y={y(needHours) - 4} fill={colors.successText} fontSize={10} fontFamily={fonts.bodySemi} textAnchor="end">
          {`Need ${needHours}h`}
        </SvgText>
      </Svg>
    </View>
  );
}

// The axis runs from 6 PM to 12 PM the next day.
const WINDOW_SPAN = 18 * 60;
const TIME_LABEL_W = 34;

/**
 * Each night from bedtime to wake time on a 6 PM to noon axis, so it's easy to
 * see whether bed and wake times line up from night to night.
 * bedMin = minutes after noon (lib/sleepStats bedMinutes), wakeMin = minutes after midnight.
 */
export function SleepWindowChart({
  nights,
  width,
  height = 170,
}: {
  nights: Array<{ label: string; bedMin: number; wakeMin: number }>;
  width: number;
  height?: number;
}) {
  if (nights.length === 0) return null;
  const left = PAD.left + TIME_LABEL_W;
  const w = width - left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const slot = w / nights.length;
  const barW = Math.max(3, Math.min(16, slot * 0.5));
  // Minutes after 6 PM: bedtimes are minutes after noon (minus 6 h), wake times after midnight (plus 6 h).
  const yOf = (afterSix: number) => PAD.top + (Math.max(0, Math.min(WINDOW_SPAN, afterSix)) / WINDOW_SPAN) * h;
  const ticks = [
    { at: 0, label: "6 PM" },
    { at: 6 * 60, label: "12 AM" },
    { at: 12 * 60, label: "6 AM" },
    { at: 18 * 60, label: "12 PM" },
  ];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Bedtime to wake time per night, ${nights.length} nights`}
    >
      <Svg width={width} height={height}>
        {ticks.map((t) => (
          <G key={t.label}>
            <Line x1={left} x2={width - PAD.right} y1={yOf(t.at)} y2={yOf(t.at)} stroke={colors.border} strokeWidth={1} />
            <SvgText x={PAD.left} y={yOf(t.at) + 3} fill={colors.textMuted} fontSize={10} fontFamily={fonts.body}>
              {t.label}
            </SvgText>
          </G>
        ))}
        {nights.map((n, i) => {
          const cx = left + slot * i + slot / 2;
          const top = yOf(n.bedMin - 6 * 60);
          const bottom = yOf(n.wakeMin + 6 * 60);
          return (
            <G key={i}>
              <Rect x={cx - barW / 2} y={top} width={barW} height={Math.max(2, bottom - top)} rx={Math.min(4, barW / 2)} fill={colors.aiAccent} />
              {n.label ? (
                <SvgText x={cx} y={height - 5} fill={colors.textMuted} fontSize={10} fontFamily={fonts.body} textAnchor="middle">
                  {n.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

/** A tiny trend line with no axes (Recovery trends rows). Needs two points. */
export function Sparkline({ values, width = 64, height = 24, color = colors.accent }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 4);
  const y = (v: number) => 2 + (max === min ? (height - 4) / 2 : (1 - (v - min) / (max - min)) * (height - 4));
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
