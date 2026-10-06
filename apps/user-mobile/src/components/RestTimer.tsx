import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ProgressRing } from "./ProgressRing";
import { useWorkoutSettings } from "../api/workoutSettings";
import { useTheme } from "../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";

interface RestTimerProps {
  /** Called when the user taps Skip / Continue. */
  onDismiss?: () => void;
  /** Seconds the timer starts at when it first mounts. Defaults to the user's workout setting, else 60. */
  defaultSeconds?: number;
  /**
   * `ring` (Figma Train 08): a big mm:ss ring with 60s/90s/120s/Custom presets.
   * `compact` (Figma Train 07): a small seconds ring with "Resting..." text and
   * -15s / +15s / Skip controls.
   */
  layout?: "ring" | "compact";
  /** Start counting down as soon as this mounts (default true). When false the ring idles at the default length until a preset is tapped. */
  autoStart?: boolean;
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
export function RestTimer({ onDismiss, defaultSeconds: defaultSecondsProp, layout = "ring", autoStart = true }: RestTimerProps) {
  const { colors: theme } = useTheme();
  const { data: settings } = useWorkoutSettings();
  const defaultSeconds = defaultSecondsProp ?? settings?.restTimerSeconds ?? 60;
  const [totalSeconds, setTotalSeconds] = useState(defaultSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState(defaultSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  };

  // Mount-only effect (no react-hooks/exhaustive-deps rule is configured in
  // this project): including `start` would re-fire on every tick.
  useEffect(() => {
    if (autoStart) start(defaultSeconds);
    return () => clearTimer();
  }, []);

  const addTime = (seconds: number) => {
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
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>Preset Rest Periods</Text>
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
              <Text style={{ color: presetActive(p) ? theme.accent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{p}s</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setCustomOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: customOpen }}
            accessibilityLabel="Custom rest"
            style={presetStyle(customOpen, theme.accent)}
          >
            <Text style={{ color: customOpen ? theme.accent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>Custom</Text>
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
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Skip rest</Text>
          </Pressable>
        ) : isComplete ? (
          <Text style={{ color: colors.success, fontSize: 12 }}>Rest complete!</Text>
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
      <Text style={{ color: emphasis ? colors.aiAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
