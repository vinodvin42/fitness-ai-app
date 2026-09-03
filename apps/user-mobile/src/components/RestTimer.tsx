import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { colors, fonts, spacing, typography } from "../theme/tokens";

interface RestTimerProps {
  /** Called when the user taps the bottom action button (Skip / Continue). */
  onDismiss?: () => void;
  /** Seconds the timer starts at when it first mounts. Default 60. */
  defaultSeconds?: number;
}

const PRESETS = [30, 60, 90, 120];

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Set/Rest Tracker's "big rest-timer ring with presets"
 * (docs/mobile/03-screen-inventory.md §C trn-08) — also used as a modal
 * overlay straight from Active Workout (trn-07) right after logging a set,
 * per that screen's own "rest-timer overlay with a ring countdown". Built
 * as a big numeral + a determinate bar rather than a literal SVG ring —
 * this mirrors the ring-to-bar substitution FuelScreen's calorie "ring"
 * already made (see its code comment), avoiding a new native-module
 * dependency for what's a purely decorative shape either way. Purely
 * client-side: no rest duration is ever sent to the API or persisted
 * anywhere — see gap §24.
 */
export function RestTimer({ onDismiss, defaultSeconds = 60 }: RestTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(defaultSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState(defaultSeconds);
  const [isRunning, setIsRunning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = (seconds: number) => {
    clearTimer();
    setTotalSeconds(seconds);
    setRemainingSeconds(seconds);
    setIsRunning(true);
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

  // Auto-starts counting down as soon as this mounts — matches trn-07's
  // "rest-timer overlay" appearing already running, not a picker the user
  // has to configure first. Empty deps: this is a mount-only effect (no
  // react-hooks/exhaustive-deps rule is configured in this project, see
  // packages/config/.eslintrc.base.json) — including `start` in deps would
  // re-fire on every tick since it closes over changing state.
  useEffect(() => {
    start(defaultSeconds);
    return () => clearTimer();
  }, []);

  const addTime = (seconds: number) => {
    setRemainingSeconds((prev) => prev + seconds);
    setTotalSeconds((prev) => prev + seconds);
    if (!isRunning) {
      setIsRunning(true);
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
    }
  };

  const isComplete = !isRunning && remainingSeconds === 0;
  const progress = totalSeconds === 0 ? 1 : 1 - remainingSeconds / totalSeconds;

  return (
    <View>
      <Text style={{ color: colors.textSecondary, ...typography.meta, textAlign: "center", marginBottom: spacing.xs }}>
        REST TIMER
      </Text>
      <Text
        style={{
          color: isComplete ? colors.success : colors.textPrimary,
          fontSize: 48,
          fontFamily: fonts.mono,
          textAlign: "center",
        }}
      >
        {formatTime(remainingSeconds)}
      </Text>
      {isComplete ? (
        <Text style={{ color: colors.success, textAlign: "center", marginTop: spacing.xs }}>Rest complete!</Text>
      ) : null}

      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden", marginTop: spacing.md }}>
        <View
          style={{
            height: "100%",
            width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
            backgroundColor: isComplete ? colors.success : colors.accent,
          }}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md, justifyContent: "center" }}>
        {PRESETS.map((p) => (
          <Chip key={p} label={`${p}s`} selected={totalSeconds === p} onPress={() => start(p)} />
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Button label="+15s" variant="secondary" onPress={() => addTime(15)} style={{ flex: 1 }} />
        <Button
          label={isComplete ? "Continue" : "Skip Rest"}
          variant={isComplete ? "primary" : "secondary"}
          onPress={() => {
            clearTimer();
            onDismiss?.();
          }}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
