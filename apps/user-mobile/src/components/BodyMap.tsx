import React from "react";
import { Pressable, Text, View } from "react-native";
import { FigmaArt, measureSvg } from "./MeasureUi";
import { MAP_CHIP_EDGES, MEASUREMENT_PARTS, type MapSpot, type MeasurementPartKey } from "../lib/measurementParts";
import { MEASURE_SVGS } from "../assets/figmaMeasureSvgs";
import { colors, fonts } from "../theme/tokens";

/** Figma's map card (measure-01/02 "body-map-card"): 358×290. */
const CARD_W = 358;
const CARD_H = 290;

export interface BodyMapValue {
  /** e.g. "82 cm" — null when this part has never been measured. */
  value: string | null;
  /** e.g. "↓3.0", "—" or "new"; null hides it. */
  change?: string | null;
}

/**
 * Figma 06b body map (measure-01 front, measure-02 back): the body outline,
 * a point and leader line per part, and a chip with its latest value and the
 * change since the compared date. Each chip opens that part's history.
 * Drawn at Figma's 358×290 and scaled to the available width.
 */
export function BodyMap({
  width,
  view,
  spots,
  values,
  onSelect,
}: {
  width: number;
  view: "front" | "back";
  spots: MapSpot[];
  values: Partial<Record<MeasurementPartKey, BodyMapValue>>;
  onSelect: (key: MeasurementPartKey) => void;
}) {
  const s = Math.min(Math.max(width, 260) / CARD_W, 1.25);
  return (
    <View style={{ width: CARD_W * s, height: CARD_H * s, alignSelf: "center", borderRadius: 16, backgroundColor: colors.surface, overflow: "hidden" }}>
      <View
        style={{
          width: CARD_W,
          height: CARD_H,
          transform: [{ translateX: (CARD_W * s - CARD_W) / 2 }, { translateY: (CARD_H * s - CARD_H) / 2 }, { scale: s }],
        }}
      >
        <FigmaArt svg={measureSvg(view === "front" ? "bodyFront" : "bodyBack")} style={{ position: "absolute", left: 119, top: 36 }} />
        {spots.map((spot) => {
          const art = MEASURE_SVGS[spot.leader.svg as keyof typeof MEASURE_SVGS];
          // The exported line is a touch larger than its box (stroke overhang): centre it on the box.
          const left = spot.leader.left - (art.width - spot.leader.width) / 2;
          const top = spot.leader.top - (art.height - spot.leader.height) / 2;
          return <FigmaArt key={`leader-${spot.key}`} svg={art} style={{ position: "absolute", left, top }} />;
        })}
        {spots.map((spot) => (
          <FigmaArt
            key={`point-${spot.key}`}
            svg={measureSvg("point")}
            style={{ position: "absolute", left: spot.point.left - 2, top: spot.point.top - 2 }}
          />
        ))}
        {spots.map((spot) => {
          const part = MEASUREMENT_PARTS[spot.key];
          const v = values[spot.key];
          const valueText = v?.value ?? "—";
          const change = v?.value && v.change ? v.change : null;
          return (
            <Pressable
              key={`chip-${spot.key}`}
              onPress={() => onSelect(spot.key)}
              accessibilityRole="button"
              accessibilityLabel={`${part.label}, ${v?.value ?? "not measured yet"}${change ? `, ${change === "—" ? "no change" : change}` : ""}. Open history`}
              hitSlop={4}
              style={{
                position: "absolute",
                top: spot.chipTop,
                ...(spot.side === "left" ? { right: CARD_W - MAP_CHIP_EDGES.left } : { left: MAP_CHIP_EDGES.right }),
                paddingTop: 4,
                paddingBottom: 5,
                paddingHorizontal: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceRaised,
              }}
            >
              <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 10, letterSpacing: 1 }}>{part.label}</Text>
              <Text numberOfLines={1} style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 11 }}>
                {valueText}
                {change ? <Text style={{ color: colors.textSecondary }}>{` · ${change}`}</Text> : null}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
