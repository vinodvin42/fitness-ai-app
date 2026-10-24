import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Exercise } from "@fitness-ai-app/types";
import { Icon } from "./Icon";
import { MediaVideo } from "./MediaVideo";
import { useTheme } from "../theme/ThemeProvider";
import { colors, fonts, radius, spacing } from "../theme/tokens";

const CUE_SECONDS = 6;

/**
 * Figma train/24 guided workout player, inside the active-exercise card: the
 * exercise's demo clip (when it has one; plays on tap, loops, no sound), a
 * "CUE 2 OF 3" pill that steps through its form cues (its instructions; tap
 * for the next, or it moves on every few seconds), and Tutorial, which opens
 * the exercise's full video and instructions.
 */
export function GuidedCues({ exercise, onTutorial }: { exercise: Exercise; onTutorial: () => void }) {
  const { colors: theme } = useTheme();
  // Short cues like Figma's ("Shoulder blades pinned back"): each sentence of the instructions, up to 6.
  const cues = (exercise.instructions ?? [])
    .flatMap((c) => c.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((c) => c.trim())
    .filter((c) => c.length > 2)
    .slice(0, 6);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [exercise.id]);
  useEffect(() => {
    if (cues.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % cues.length), CUE_SECONDS * 1000);
    return () => clearInterval(t);
  }, [exercise.id, cues.length]);

  const hasVideo = !!exercise.video;
  if (!hasVideo && cues.length === 0) return null;
  const cue = cues[index % Math.max(cues.length, 1)];

  return (
    <View style={{ gap: spacing.sm }}>
      {exercise.video ? (
        <View style={{ borderRadius: radius.md, overflow: "hidden" }}>
          <MediaVideo
            video={exercise.video}
            aspectRatio={exercise.video.aspect === "9:16" ? 9 / 16 : 16 / 9}
            fit="contain"
            loop
            hasSound={false}
            label={`${exercise.name} demo`}
          />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {cues.length > 0 ? (
          <Pressable
            onPress={() => setIndex((i) => (i + 1) % cues.length)}
            accessibilityRole="button"
            accessibilityLabel={`Form cue ${index + 1} of ${cues.length}: ${cue.replace(/[.!?]$/, "")}. Tap for the next cue`}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceRaised,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.8 }}>
              CUE {index + 1} OF {cues.length}
            </Text>
            <Text numberOfLines={2} style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
              {cue}
            </Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable
          onPress={onTutorial}
          accessibilityRole="button"
          accessibilityLabel={`Tutorial: ${exercise.name} video and instructions`}
          hitSlop={6}
          style={{ alignItems: "center", gap: 2, paddingHorizontal: 4 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
            <Icon name="video" size={16} color={colors.textPrimary} />
          </View>
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 11 }}>Tutorial</Text>
        </Pressable>
      </View>
    </View>
  );
}
