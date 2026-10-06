import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { colors, fonts, typography } from "../theme/tokens";

/**
 * Small dark-theme chart kit (react-native-svg). Each chart is a single
 * accessible element whose `accessibilityLabel` summarizes the data, since SVG
 * internals are not readable by screen readers.
 */

export interface ChartPoint {
  label: string;
  value: number;
}

interface BaseChartProps {
  data: ChartPoint[];
  width?: number;
  height?: number;
  color?: string;
  accessibilityLabel: string;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 12 };

function summarize(data: ChartPoint[]): string {
  return data.map((d) => `${d.label} ${d.value}`).join(", ");
}

function range(data: ChartPoint[]) {
  const values = data.map((d) => d.value);
  return { min: Math.min(0, ...values), max: Math.max(1, ...values) };
}

export function LineChart({ data, width = 320, height = 160, color = colors.accent, accessibilityLabel }: BaseChartProps) {
  if (data.length === 0) return null;
  const { min, max } = range(data);
  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v: number) => PAD.top + h - ((v - min) / (max - min || 1)) * h;
  const d = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${accessibilityLabel}. ${summarize(data)}`}>
      <Svg width={width} height={height}>
        <Line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + h} y2={PAD.top + h} stroke={colors.border} strokeWidth={1} />
        <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((p, i) => (
          <Circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={color} />
        ))}
        {data.map((p, i) =>
          i === 0 || i === data.length - 1 ? (
            <SvgText
              key={`l${i}`}
              x={x(i)}
              y={height - 6}
              fill={colors.textMuted}
              fontSize={10}
              fontFamily={fonts.body}
              textAnchor={i === 0 ? "start" : "end"}
            >
              {p.label}
            </SvgText>
          ) : null,
        )}
      </Svg>
    </View>
  );
}

export function BarChart({ data, width = 320, height = 160, color = colors.accent, accessibilityLabel }: BaseChartProps) {
  if (data.length === 0) return null;
  const { min, max } = range(data);
  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const slot = w / data.length;
  const barW = Math.min(28, slot * 0.6);
  const base = PAD.top + h;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${accessibilityLabel}. ${summarize(data)}`}>
      <Svg width={width} height={height}>
        <Line x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} stroke={colors.border} strokeWidth={1} />
        {data.map((p, i) => {
          const bh = Math.max(2, ((p.value - min) / (max - min || 1)) * h);
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <G key={i}>
              <Rect x={cx - barW / 2} y={base - bh} width={barW} height={bh} rx={4} fill={color} />
              <SvgText x={cx} y={height - 6} fill={colors.textMuted} fontSize={10} fontFamily={fonts.body} textAnchor="middle">
                {p.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  accessibilityLabel: string;
}

export function DonutChart({ slices, size = 140, strokeWidth = 16, centerLabel, accessibilityLabel }: DonutChartProps) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices.map((s, i) => {
    const len = total > 0 ? (Math.max(0, s.value) / total) * c : 0;
    const el = (
      <Circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={s.color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${len} ${c - len}`}
        strokeDashoffset={-offset}
      />
    );
    offset += len;
    return el;
  });
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${accessibilityLabel}. ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceHigh} strokeWidth={strokeWidth} fill="none" />
          {arcs}
        </G>
      </Svg>
      {centerLabel ? <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{centerLabel}</Text> : null}
    </View>
  );
}
