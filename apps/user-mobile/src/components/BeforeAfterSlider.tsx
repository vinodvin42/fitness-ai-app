import React, { useRef, useState } from "react";
import { Image, LayoutChangeEvent, PanResponder, Text, View } from "react-native";
import { colors, radius, spacing, typography } from "../theme/tokens";

export interface SliderSide {
  uri: string;
  /** Short caption in the top corner, e.g. "APR 2026". */
  label: string;
  /** Optional caption in the bottom corner, e.g. "90.0 kg". */
  caption: string | null;
}

/**
 * Draggable before / after comparison (Figma Progress 06). The "after" photo
 * is revealed from the right edge as the divider moves left; drag anywhere on
 * the image. Both photos are the user's own (first vs latest by default).
 */
export function BeforeAfterSlider({ before, after, height = 280 }: { before: SliderSide; after: SliderSide; height?: number }) {
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState(0.5); // divider position, 0-1 of the width
  const start = useRef(0.5);
  const widthRef = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const w = widthRef.current || 1;
        const next = Math.max(0, Math.min(1, e.nativeEvent.locationX / w));
        start.current = next;
        setPos(next);
      },
      onPanResponderMove: (_e, g) => {
        const w = widthRef.current || 1;
        setPos(Math.max(0, Math.min(1, start.current + g.dx / w)));
      },
    }),
  ).current;

  const split = width * pos;
  const chip = (text: string, accent: boolean) => (
    <Text
      style={{
        color: accent ? colors.textOnAccent : colors.textPrimary,
        backgroundColor: accent ? colors.accent : "rgba(0,0,0,0.55)",
        ...typography.caption,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {text}
    </Text>
  );

  return (
    <View
      onLayout={onLayout}
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Before and after comparison, ${before.label} and ${after.label}`}
      style={{ height, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#000" }}
    >
      <Image source={{ uri: before.uri }} style={{ position: "absolute", left: 0, top: 0, width, height }} resizeMode="cover" />
      <View style={{ position: "absolute", left: split, top: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        <Image source={{ uri: after.uri }} style={{ position: "absolute", left: -split, top: 0, width, height }} resizeMode="cover" />
      </View>

      <View style={{ position: "absolute", left: split - 1, top: 0, bottom: 0, width: 2, backgroundColor: colors.textPrimary }} pointerEvents="none" />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: Math.max(0, Math.min(width - 30, split - 15)),
          top: height / 2 - 15,
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.textPrimary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#09090b", fontSize: 12 }}>{"‹ ›"}</Text>
      </View>

      <View pointerEvents="none" style={{ position: "absolute", top: spacing.sm, left: spacing.sm }}>
        {chip(before.label, false)}
      </View>
      <View pointerEvents="none" style={{ position: "absolute", top: spacing.sm, right: spacing.sm }}>
        {chip(after.label, true)}
      </View>
      {before.caption ? (
        <View pointerEvents="none" style={{ position: "absolute", bottom: spacing.sm, left: spacing.sm }}>
          {chip(before.caption, false)}
        </View>
      ) : null}
      {after.caption ? (
        <View pointerEvents="none" style={{ position: "absolute", bottom: spacing.sm, right: spacing.sm }}>
          {chip(after.caption, false)}
        </View>
      ) : null}
    </View>
  );
}
