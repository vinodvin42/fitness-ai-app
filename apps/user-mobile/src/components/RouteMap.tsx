import React, { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { decodePolyline, routeToSvgPath } from "../lib/gpsTrack";
import { colors } from "../theme/tokens";

/** Draws an encoded polyline as a normalized SVG path (no map tiles / SDK). */
export function RouteMap({ polyline, height = 200 }: { polyline: string; height?: number }) {
  const [width, setWidth] = useState(0);
  const path = useMemo(
    () => (width > 0 ? routeToSvgPath(decodePolyline(polyline), width, height) : null),
    [polyline, width, height],
  );
  return (
    <View
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={{ height, borderRadius: 12, backgroundColor: colors.surface, overflow: "hidden" }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Route preview"
    >
      {path ? (
        <Svg width={width} height={height}>
          <Path d={path.d} stroke={colors.accent} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={path.start[0]} cy={path.start[1]} r={5} fill={colors.success} />
          <Circle cx={path.end[0]} cy={path.end[1]} r={5} fill={colors.orange} />
        </Svg>
      ) : null}
    </View>
  );
}
