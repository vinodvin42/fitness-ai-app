import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { ResizeMode, Video, type AVPlaybackStatus } from "expo-av";
import { Icon } from "./Icon";
import { clipAction, clipLengthLabel, type VideoClip } from "../lib/recipeVideo";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

type Props = {
  /** Any hosted clip: Recipe.video and Exercise.video both have these two fields. */
  video: { url: string; durationSec: number };
  /** Width ÷ height of the player. Recipe videos are square; exercise clips vary (lib/exerciseVideo.ts playerShape). */
  aspectRatio?: number;
  /** "contain" shows the whole frame (e.g. a portrait clip in a 4:5 box) on `backdrop`; default "cover" fills the box. */
  fit?: "cover" | "contain";
  /** Box colour behind a "contain" clip, chosen to blend with the clip's own background. */
  backdrop?: string;
  /** Shown before playback starts and while loading (the hero image or photo). */
  poster?: string | null;
  /** Play only this part (e.g. one cooking-mode step) instead of the whole video. */
  clip?: VideoClip | null;
  /** Loop the clip (or the whole video). Cooking mode loops: hands are busy. */
  loop?: boolean;
  /** Start without a tap — only where the person has just asked to watch. */
  autoPlay?: boolean;
  /** False for clips with no sound track (e.g. exercise clips): hides the sound toggle. */
  hasSound?: boolean;
  /** Spoken name, e.g. "recipe video" or "step 2 video". */
  label: string;
};

type Phase = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

/**
 * Video player for recipe and exercise videos (Oct 2026; data from
 * Recipe.video / Exercise.video, clip helpers in lib/recipeVideo.ts). Muted
 * by default with a sound toggle, no native controls: tap to play or pause,
 * Replay when it ends. Nothing loads until it is tapped (or `autoPlay`), so
 * opening a screen never spends mobile data. It pauses when its screen loses
 * focus (e.g. cooking mode pushed over Recipe Detail). A failed load shows
 * "Video unavailable" with Retry; the rest of the screen keeps working. Built
 * on expo-av (SDK 51); a later SDK can swap this one file to expo-video.
 */
export function MediaVideo({ video, aspectRatio = 1, fit = "cover", backdrop, poster, clip = null, loop = false, autoPlay = false, hasSound = true, label }: Props) {
  const { colors: theme } = useTheme();
  const ref = useRef<Video>(null);
  const [phase, setPhase] = useState<Phase>(autoPlay ? "loading" : "idle");
  const [muted, setMuted] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef(false);
  const focused = useIsFocused();
  const clipStart = clip?.startSec ?? 0;
  const length = clip ? clip.endSec - clip.startSec : video.durationSec;

  // A new clip (the next cooking step) plays from its own start.
  useEffect(() => {
    if (!loaded.current || !clip) return;
    setPhase("playing");
    ref.current?.playFromPositionAsync(clip.startSec * 1000).catch(() => undefined);
  }, [clip?.startSec, clip?.endSec]);

  useEffect(() => {
    if (!focused && (phase === "playing" || phase === "loading")) {
      ref.current?.pauseAsync().catch(() => undefined);
      setPhase(loaded.current ? "paused" : "idle");
    }
  }, [focused]);

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) setPhase("error");
      return;
    }
    if (!loaded.current) {
      loaded.current = true;
      ref.current?.playFromPositionAsync(clipStart * 1000).catch(() => setPhase("error"));
      setPhase("playing");
      return;
    }
    const action = clipAction(status.positionMillis, clip, loop);
    if (action === "restart") {
      ref.current?.setPositionAsync(clipStart * 1000).catch(() => undefined);
    } else if (action === "pause") {
      ref.current?.pauseAsync().catch(() => undefined);
      setPhase("ended");
    } else if (!clip && status.didJustFinish && !loop) {
      setPhase("ended");
    }
  };

  const start = () => {
    loaded.current = false;
    setPhase("loading");
  };

  const toggle = () => {
    if (phase === "idle") return start();
    if (phase === "ended") {
      setPhase("playing");
      ref.current?.playFromPositionAsync(clipStart * 1000).catch(() => setPhase("error"));
      return;
    }
    if (phase === "playing") {
      ref.current?.pauseAsync().catch(() => undefined);
      setPhase("paused");
    } else if (phase === "paused") {
      ref.current?.playAsync().catch(() => setPhase("error"));
      setPhase("playing");
    }
  };

  const mounted = phase !== "idle";
  const showPoster = phase === "idle" || phase === "loading" || phase === "error";
  const a11yState = phase === "idle" ? `Play ${label}, ${clipLengthLabel(length)}` : phase === "playing" ? `Pause ${label}` : `Play ${label}`;

  return (
    <View style={{ width: "100%", aspectRatio, borderRadius: radius.card, overflow: "hidden", backgroundColor: backdrop ?? colors.surfaceRaised }}>
      {mounted ? (
        <Video
          key={attempt}
          ref={ref}
          source={{ uri: video.url }}
          style={StyleSheet.absoluteFill}
          resizeMode={fit === "contain" ? ResizeMode.CONTAIN : ResizeMode.COVER}
          isMuted={muted}
          isLooping={loop && !clip}
          progressUpdateIntervalMillis={250}
          onPlaybackStatusUpdate={onStatus}
          onError={() => setPhase("error")}
        />
      ) : null}

      {showPoster ? (
        poster ? (
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode={fit} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: backdrop ?? "#111417" }]} />
        )
      ) : null}

      {phase === "error" ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", gap: spacing.sm }]}>
          <Text style={{ color: "#ffffff", fontFamily: fonts.bodySemi, fontSize: 14 }}>Video unavailable</Text>
          <Pressable
            onPress={() => {
              setAttempt((n) => n + 1);
              start();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Retry ${label}`}
            style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: "#ffffff", paddingHorizontal: 16, paddingVertical: 6 }}
          >
            <Text style={{ color: "#ffffff", fontFamily: fonts.bodySemi, fontSize: 13 }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={a11yState} style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          {phase === "loading" ? (
            <ActivityIndicator color="#ffffff" size="large" />
          ) : phase === "playing" ? null : (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}>
              <Icon name={phase === "ended" ? "rotate-cw" : "play"} size={24} color={theme.textOnAccent} />
            </View>
          )}
        </Pressable>
      )}

      {phase === "idle" ? (
        <View style={{ position: "absolute", right: spacing.sm, bottom: spacing.sm, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: "#ffffff", fontFamily: fonts.bodySemi, fontSize: 12 }}>{clipLengthLabel(length)}</Text>
        </View>
      ) : null}

      {hasSound && (phase === "playing" || phase === "paused" || phase === "ended") ? (
        <Pressable
          onPress={() => setMuted((m) => !m)}
          accessibilityRole="button"
          accessibilityLabel={muted ? "Turn sound on" : "Turn sound off"}
          hitSlop={8}
          style={{ position: "absolute", left: spacing.sm, bottom: spacing.sm, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 4 }}
        >
          <Text style={{ color: "#ffffff", fontFamily: fonts.bodySemi, fontSize: 12 }}>{muted ? "Sound off" : "Sound on"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
