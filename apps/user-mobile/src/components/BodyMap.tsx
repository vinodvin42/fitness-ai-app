import React from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, G, Line } from "react-native-svg";
import { BodyShapes } from "./ProgressCharts";
import { MEASUREMENT_PARTS, type MapSpot, type MeasurementPartKey } from "../lib/measurementParts";
import { colors, fonts, radius } from "../theme/tokens";

// Map space: 360×300. The 300×380 figure is drawn at 0.75 scale in the middle.
const VIEW_W = 360;
const VIEW_H = 300;
const FIG_SCALE = 0.75;
const FIG_X = (VIEW_W - 300 * FIG_SCALE) / 2;
const FIG_Y = 2;
const BOX_W = 108;
const BOX_H = 36;
const LEFT_X = 4;
const RIGHT_X = VIEW_W - 4 - BOX_W;

export interface BodyMapValue {
  /** e.g. "82 cm" — null when this part has never been measured. */
  value: string | null;
  /** e.g. "↓3.0" or "—"; omitted on a first log. */
  change?: string | null;
}

/**
 * Figma 06b body map: a label per measured part beside the figure, joined by a
 * leader line. Each label is a button that opens that part's history.
 */
export function BodyMap({
  width,
  spots,
  values,
  onSelect,
}: {
  width: number;
  spots: MapSpot[];
  values: Partial<Record<MeasurementPartKey, BodyMapValue>>;
  onSelect: (key: MeasurementPartKey) => void;
}) {
  const s = Math.max(width, 200) / VIEW_W;
  const height = VIEW_H * s;
  const rowsPerSide = (side: "left" | "right") => spots.filter((p) => p.side === side).length;
  const boxTop = (spot: MapSpot) => {
    const n = rowsPerSide(spot.side);
    const pitch = n > 1 ? (VIEW_H - 8 - BOX_H) / (n - 1) : 0;
    return 4 + spot.row * pitch;
  };
  const anchor = (spot: MapSpot) => ({ x: FIG_X + spot.ax * FIG_SCALE, y: FIG_Y + spot.ay * FIG_SCALE });

  return (
    <View style={{ width: VIEW_W * s, height, alignSelf: "center" }}>
      <Svg width={VIEW_W * s} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ position: "absolute" }}>
        <G transform={`translate(${FIG_X} ${FIG_Y}) scale(${FIG_SCALE})`}>
          <BodyShapes fill={colors.surfaceHigh} />
        </G>
        {spots.map((spot) => {
          const a = anchor(spot);
          const y = boxTop(spot) + BOX_H / 2;
          const x2 = spot.side === "left" ? LEFT_X + BOX_W : RIGHT_X;
          const measured = values[spot.key]?.value != null;
          return (
            <React.Fragment key={spot.key}>
              <Line x1={a.x} y1={a.y} x2={x2} y2={y} stroke={measured ? colors.accent : colors.border} strokeWidth={1} />
              <Circle cx={a.x} cy={a.y} r={4} fill={measured ? colors.accent : colors.borderStrong} />
            </React.Fragment>
          );
        })}
      </Svg>
      {spots.map((spot) => {
        const part = MEASUREMENT_PARTS[spot.key];
        const v = values[spot.key];
        const label = `${part.label}, ${v?.value ?? "not measured"}${v?.change ? `, ${v.change}` : ""}`;
        return (
          <Pressable
            key={spot.key}
            onPress={() => onSelect(spot.key)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Shows this measurement's history"
            style={{
              position: "absolute",
              left: (spot.side === "left" ? LEFT_X : RIGHT_X) * s,
              top: boxTop(spot) * s,
              width: BOX_W * s,
              minHeight: BOX_H * s,
              justifyContent: "center",
              paddingHorizontal: 6,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
              {part.label}
            </Text>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12 }} numberOfLines={1}>
              {v?.value ?? "—"}
              {v?.value != null && v.change ? <Text style={{ color: colors.textSecondary, fontFamily: fonts.body }}> · {v.change}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
