import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";
import { ProgressRing } from "./ProgressRing";
import { useWorkoutSettings } from "../api/workoutSettings";
import { useTheme } from "../theme/ThemeProvider";
import { colors, elevation, fonts, radius, spacing, typography } from "../theme/tokens";
import { formatMmSs } from "../lib/format";

interface RestTimerProps {
  /** Called when the user taps Skip / Continue. */
  onDismiss?: () => void;
  /** Seconds the timer starts at when it first mounts. Defaults to the user's workout setting, else 60. */
  defaultSeconds?: number;
  /**
   * `ring` (Figma Train 08): a big mm:ss ring with 60s/90s/120s/Custom presets.
   * `compact` (Figma Train 07): a small seconds ring with "Resting..." text and
   * -15s / +15s / Skip controls.
   * `pill` (Figma log/02, 25 Oct 2026): one rounded bar, "Rest · auto 1:30
   * −15s +15s Skip", for the bottom of the workout screen.
   */
  layout?: "ring" | "compact" | "pill";
  /** The pill's label, e.g. "Rest · auto" when it started by itself. */
  caption?: string;
  /** Start counting down as soon as this mounts (default true). When false the ring idles at the default length until a preset is tapped. */
  autoStart?: boolean;
  /**
   * When the running rest ends (epoch ms), or null once it stops: `finished`
   * is true when it ran out by itself, false when skipped or closed (24 Oct
   * 2026: keeps the workout notification and its "Rest over" alert in step).
   */
  onRestChange?: (endsAt: number | null, finished: boolean) => void;
}

const PRESETS = [60, 90, 120];

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Rest timer shared by Active Workout (compact, inline under the active
 * exercise card) and Set & Rest Tracker (ring with presets). Purely
 * client-side: no rest duration is sent to the API or persisted — see gap §24.
 */
export function RestTimer({ onDismiss, defaultSeconds: defaultSecondsProp, layout = "ring", autoStart = true, onRestChange, caption = "Rest" }: RestTimerProps) {
  const { t } = useTranslation();
  const { colors: theme } = useTheme();
  const { data: settings } = useWorkoutSettings();
  const defaultSeconds = defaultSecondsProp ?? settings?.restTimerSeconds ?? 60;
  const [totalSeconds, setTotalSeconds] = useState(defaultSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState(defaultSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The latest callback, so the mount-only effects below always call the current one.
  const restChange = useRef(onRestChange);
  restChange.current = onRestChange;

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const tick = () => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          setIsRunning(false);
          restChange.current?.(null, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const start = (seconds: number) => {
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setIsRunning(true);
    tick();
    restChange.current?.(Date.now() + seconds * 1000, false);
  };

  // Mount-only effect (no react-hooks/exhaustive-deps rule is configured in
  // this project): including `start` would re-fire on every tick.
  useEffect(() => {
    if (autoStart) start(defaultSeconds);
    return () => {
      clearTimer();
      restChange.current?.(null, false);
    };
  }, []);

  const addTime = (seconds: number) => {
    const next = Math.max(0, remainingSeconds + seconds);
    if (isRunning || seconds > 0) restChange.current?.(next > 0 ? Date.now() + next * 1000 : null, false);
    setRemainingSeconds((prev) => Math.max(0, prev + seconds));
    setTotalSeconds((prev) => Math.max(1, prev + seconds));
    if (!isRunning && seconds > 0) {
      setIsRunning(true);
      tick();
    }
  };

  const isComplete = !isRunning && remainingSeconds === 0;
  const progress = totalSeconds === 0 ? 1 : remainingSeconds / totalSeconds;
  const ringColor = isComplete ? colors.success : layout === "compact" ? colors.aiAccent : theme.accent;

  if (layout === "pill") {
    const idle = !isRunning && !isComplete;
    return (
      <View
        style={{
          alignSelf: "center",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingLeft: 18,
          paddingRight: 10,
          paddingVertical: 10,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: isComplete ? colors.success : theme.accent,
          backgroundColor: colors.surfaceRaised,
          ...elevation.card,
        }}
      >
        <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{isComplete ? "Rest done" : caption}</Text>
        <Text
          accessibilityLabel={isComplete ? "Rest done" : `${remainingSeconds} seconds of rest left`}
          style={{ color: isComplete ? colors.successText : colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 18, fontVariant: ["tabular-nums"], minWidth: 40 }}
        >
          {formatMmSs(remainingSeconds)}
        </Text>
        {isComplete ? null : (
          <>
            <PillButton label="−15s" accessibilityLabel="15 seconds less rest" onPress={() => addTime(-15)} />
            <PillButton label="+15s" accessibilityLabel="15 seconds more rest" onPress={() => addTime(15)} />
          </>
        )}
        <PillButton
          label={isComplete ? "Continue" : idle ? "Start" : "Skip"}
          accessibilityLabel={isComplete ? "Continue" : idle ? "Start rest" : "Skip rest"}
          primary
          onPress={() => {
            if (idle) {
              start(remainingSeconds > 0 ? remainingSeconds : defaultSeconds);
              return;
            }
            clearTimer();
            if (!isComplete) restChange.current?.(null, false);
            onDismiss?.();
          }}
        />
      </View>
    );
  }

  if (layout === "compact") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <ProgressRing progress={progress} size={62} strokeWidth={5} color={ringColor}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 14 }}>{remainingSeconds}s</Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
            {isComplete ? "Rest complete" : `Resting... (${defaultSeconds}s default)`}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {isComplete ? null : (
              <>
                <MiniButton label="-15s" onPress={() => addTime(-15)} />
                <MiniButton label="+15s" onPress={() => addTime(15)} />
              </>
            )}
            <MiniButton
              label={isComplete ? "Continue" : "Skip"}
              emphasis
              onPress={() => {
                clearTimer();
                if (!isComplete) restChange.current?.(null, false);
                onDismiss?.();
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  const presetActive = (p: number) => totalSeconds === p && !customOpen;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <ProgressRing progress={progress} size={92} strokeWidth={6} color={ringColor}>
        <Text style={{ color: isComplete ? colors.success : colors.textPrimary, fontFamily: fonts.mono, fontSize: 18 }}>
          {formatTime(remainingSeconds)}
        </Text>
      </ProgressRing>
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>{t("restTimer.title")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {PRESETS.map((p) => (
            <Pressable
              key={p}
              onPress={() => {
                setCustomOpen(false);
                start(p);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: presetActive(p) }}
              accessibilityLabel={`${p} seconds`}
              style={presetStyle(presetActive(p), theme.accent)}
            >
              <Text style={{ color: presetActive(p) ? theme.accent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{p}s</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setCustomOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: customOpen }}
            accessibilityLabel="Custom rest"
            style={presetStyle(customOpen, theme.accent)}
          >
            <Text style={{ color: customOpen ? theme.accent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>Custom</Text>
          </Pressable>
        </View>
        {customOpen ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={customText}
              onChangeText={(v) => setCustomText(v.replace(/[^0-9]/g, "").slice(0, 3))}
              placeholder="Seconds"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              accessibilityLabel="Custom rest seconds"
              style={{
                width: 90,
                height: 34,
                color: colors.textPrimary,
                backgroundColor: colors.surfaceRaised,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 10,
              }}
            />
            <MiniButton
              label="Start"
              emphasis
              onPress={() => {
                const n = parseInt(customText, 10);
                if (n > 0) start(n);
              }}
            />
          </View>
        ) : null}
        {isRunning ? (
          <Pressable
            onPress={() => {
              clearTimer();
              setIsRunning(false);
              setRemainingSeconds(0);
              onDismiss?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Skip rest"
          >
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Skip rest</Text>
          </Pressable>
        ) : isComplete ? (
          <Text style={{ color: colors.successText, fontSize: 13 }}>{t("restTimer.complete")}</Text>
        ) : null}
      </View>
    </View>
  );
}

function presetStyle(active: boolean, accent: string) {
  return {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: active ? accent : colors.border,
    backgroundColor: active ? "rgba(37,99,235,0.12)" : colors.surfaceRaised,
  } as const;
}

function PillButton({ label, accessibilityLabel, onPress, primary }: { label: string; accessibilityLabel: string; onPress: () => void; primary?: boolean }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => ({
        paddingHorizontal: primary ? 14 : 10,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: primary ? theme.accent : colors.surfaceHigh,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: primary ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function MiniButton({ label, onPress, emphasis }: { label: string; onPress: () => void; emphasis?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: emphasis ? colors.aiBorder : colors.border,
        backgroundColor: emphasis ? colors.aiAccentSoft : colors.surfaceRaised,
      }}
    >
      <Text style={{ color: emphasis ? colors.aiAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
