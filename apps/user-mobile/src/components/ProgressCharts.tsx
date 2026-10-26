import React from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { colors } from "../theme/tokens";

/**
 * Progress-specific SVG visuals (Figma Progress 01-03): the weight-vs-goal
 * line chart, the two-series composition trend and the body silhouette with
 * measurement callouts. All values come from the caller (real logs); nothing
 * is drawn that was not passed in.
 */

export interface SeriesPoint {
  at: string;
  value: number;
}

/** `minSpan` (as a fraction of the mean) keeps a nearly flat series looking flat instead of stretching noise to fill the chart. */
function scale(values: number[], pad = 0.08, minSpan = 0) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = (min + max) / 2;
  const span = Math.max(max - min, Math.abs(mean) * minSpan) || 1;
  return { lo: mean - span / 2 - span * pad, hi: mean + span / 2 + span * pad };
}

/** Weight line with an optional dashed goal line. Values are in display units. */
export function WeightGoalChart({
  points,
  goal,
  width,
  height = 130,
  accessibilityLabel,
}: {
  points: SeriesPoint[];
  goal: number | null;
  width: number;
  height?: number;
  accessibilityLabel: string;
}) {
  if (points.length === 0) return null;
  width = Math.max(width, 40);
  const vals = points.map((p) => p.value).concat(goal != null ? [goal] : []);
  const { lo, hi } = scale(vals);
  const padX = 8;
  const w = width - padX * 2;
  const x = (i: number) => padX + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (height - 16);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        {goal != null ? (
          <Line x1={padX} x2={width - padX} y1={y(goal)} y2={y(goal)} stroke={colors.success} strokeWidth={1.25} strokeDasharray="4 4" />
        ) : null}
        <Path d={d} stroke={colors.accent} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={x(0)} cy={y(points[0].value)} r={3.5} fill={colors.accent} />
        <Circle cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={4} fill={colors.accent} />
      </Svg>
    </View>
  );
}

/** Two independently scaled lines (each fills the chart's height) - used for body fat % vs derived lean mass. */
export function DualLineChart({
  a,
  b,
  width,
  height = 150,
  colorA = colors.accent,
  colorB = colors.aiAccent,
  accessibilityLabel,
}: {
  a: SeriesPoint[];
  b: SeriesPoint[];
  width: number;
  height?: number;
  colorA?: string;
  colorB?: string;
  accessibilityLabel: string;
}) {
  width = Math.max(width, 40);
  const times = a.concat(b).map((p) => new Date(p.at).getTime());
  if (times.length === 0) return null;
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const padX = 8;
  const w = width - padX * 2;
  const x = (at: string) => padX + (t1 === t0 ? w / 2 : ((new Date(at).getTime() - t0) / (t1 - t0)) * w);
  const line = (pts: SeriesPoint[], color: string) => {
    if (pts.length === 0) return null;
    const { lo, hi } = scale(pts.map((p) => p.value), 0.08, 0.06);
    const y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (height - 20);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    return (
      <>
        <Path d={d} stroke={color} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <Circle key={i} cx={x(p.at)} cy={y(p.value)} r={2.75} fill={color} />
        ))}
      </>
    );
  };
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={width} height={height}>
        <Line x1={padX} x2={width - padX} y1={height - 6} y2={height - 6} stroke={colors.border} strokeWidth={1} />
        {line(a, colorA)}
        {line(b, colorB)}
      </Svg>
    </View>
  );
}
