import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { exerciseFrames, FRAME_MS } from "../lib/exerciseFrames";
import { colors, fonts, radius, spacing } from "../theme/tokens";

type Props = {
  mediaUrl: string;
  exerciseName: string;
  height?: number;
};

/**
 * Exercise demonstration (Exercise Detail): the start and end stills from
 * free-exercise-db shown as a gentle cross-fading loop with a START / END
 * chip (lib/exerciseFrames.ts). It's two photos, not a video, and the chip
 * says which position is showing. A Pause/Play control stops the motion, it
 * starts paused when the system's Reduce Motion setting is on, and it stops
 * while the screen isn't focused. The loop only starts once the second photo
 * has loaded; until then, or if it fails, the start photo shows on its own,
 * exactly as before. Any other image URL is shown as a single still.
 */
export function ExerciseMotion({ mediaUrl, exerciseName, height = 220 }: Props) {
  const frames = exerciseFrames(mediaUrl);
  const [endReady, setEndReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [showEnd, setShowEnd] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const focused = useIsFocused();
  const endUrl = frames?.[1];

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (alive && reduce) setPlaying(false);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setEndReady(false);
    setShowEnd(false);
    if (!endUrl) return;
    let alive = true;
    Image.prefetch(endUrl)
      .then((ok) => {
        if (alive && ok) setEndReady(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [endUrl]);

  const looping = endReady && playing && focused;
  useEffect(() => {
    if (!looping) return;
    const id = setInterval(() => setShowEnd((v) => !v), FRAME_MS);
    return () => clearInterval(id);
  }, [looping]);

  useEffect(() => {
    Animated.timing(fade, { toValue: showEnd ? 1 : 0, duration: 250, useNativeDriver: true }).start();
  }, [showEnd, fade]);

  const box = { width: "100%" as const, height, borderRadius: radius.card, overflow: "hidden" as const, backgroundColor: colors.surfaceRaised };

  if (!frames || !endReady) {
    return (
      <View style={box}>
        <Image
          source={{ uri: mediaUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityLabel={`${exerciseName} demonstration photo`}
        />
      </View>
    );
  }

  return (
    <View style={box}>
      <View accessible accessibilityRole="image" accessibilityLabel={`${exerciseName}: start and end positions`} style={StyleSheet.absoluteFill}>
        <Image source={{ uri: frames[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <Animated.Image source={{ uri: frames[1] }} style={[StyleSheet.absoluteFill, { opacity: fade }]} resizeMode="cover" />
      </View>
      <View
        style={{ position: "absolute", left: spacing.sm, top: spacing.sm, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 3 }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Text style={{ color: "#ffffff", fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6 }}>{showEnd ? "END" : "START"}</Text>
      </View>
      <Pressable
        onPress={() => setPlaying((p) => !p)}
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause the demonstration" : "Play the demonstration"}
        hitSlop={8}
        style={{ position: "absolute", right: spacing.sm, bottom: spacing.sm, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 4 }}
      >
        <Text style={{ color: "#ffffff", fontFamily: fonts.bodySemi, fontSize: 12 }}>{playing ? "Pause" : "Play"}</Text>
      </Pressable>
      {!playing ? (
        <Pressable
          onPress={() => setShowEnd((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showEnd ? "Show the start position" : "Show the end position"}
          hitSlop={8}
          style={{ position: "absolute", left: spacing.sm, bottom: spacing.sm, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 4 }}
        >
          <Text style={{ color: "#ffffff", fontFamily: fonts.bodySemi, fontSize: 12 }}>{showEnd ? "Show start" : "Show end"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
