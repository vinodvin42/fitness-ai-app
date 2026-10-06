import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import {
  BREATHING_DURATIONS_MIN,
  BREATHING_PATTERNS,
  WELLNESS_NOTE,
} from "../../content/recover";
import { useLogMindfulness } from "../../lib/useMindfulnessLog";
import { extractErrorMessage } from "../../lib/apiError";
import { formatMmSs } from "../../lib/format";
import { colors, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";

type Props = NativeStackScreenProps<RecoverStackParamList, "GuidedBreathing">;

const MIN_SCALE = 0.55;
const CIRCLE = 240;

type Phase = "setup" | "running" | "done";

/**
 * Recover 09 - Guided Breathing. An expanding circle (Animated, native driver)
 * follows the pattern's inhale / hold / exhale phases. A finished (or
 * stopped after 1+ minute) session is logged via POST /mindfulness-logs.
 */
export function GuidedBreathingScreen({ navigation, route }: Props) {
  const [patternId, setPatternId] = useState(route.params?.patternId ?? BREATHING_PATTERNS[0].id);
  const [minutes, setMinutes] = useState<number>(BREATHING_DURATIONS_MIN[1]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [clock, setClock] = useState({ idx: 0, left: 0, elapsed: 0 });
  const { idx: phaseIdx, left: phaseLeft, elapsed } = clock;
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const logger = useLogMindfulness();

  const pattern = BREATHING_PATTERNS.find((p) => p.id === patternId) ?? BREATHING_PATTERNS[0];
  const totalSeconds = minutes * 60;

  // Drive the circle whenever the active phase changes.
  useEffect(() => {
    if (phase !== "running") return;
    const p = pattern.phases[phaseIdx];
    if (p.label === "Inhale") {
      Animated.timing(scale, { toValue: 1, duration: p.seconds * 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
    } else if (p.label === "Exhale") {
      Animated.timing(scale, { toValue: MIN_SCALE, duration: p.seconds * 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
    }
    // "Hold" leaves the circle where it is.
  }, [phase, phaseIdx, pattern, scale]);

  // One-second clock for the countdown and phase advancing.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      setClock((prev) => {
        const nextElapsed = prev.elapsed + 1;
        if (prev.left > 1) return { ...prev, left: prev.left - 1, elapsed: nextElapsed };
        const idx = (prev.idx + 1) % pattern.phases.length;
        return { idx, left: pattern.phases[idx].seconds, elapsed: nextElapsed };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, pattern]);

  useEffect(() => {
    if (phase === "running" && elapsed >= totalSeconds) {
      scale.stopAnimation();
      setPhase("done");
      logger.mutate({ seconds: elapsed, type: "breathing", note: pattern.name });
    }
  }, [elapsed, phase]);

  const start = () => {
    scale.setValue(MIN_SCALE);
    logger.reset();
    setClock({ idx: 0, left: pattern.phases[0].seconds, elapsed: 0 });
    setPhase("running");
  };

  const stop = () => {
    scale.stopAnimation();
    if (elapsed >= 60) {
      setPhase("done");
      logger.mutate({ seconds: elapsed, type: "breathing", note: pattern.name });
    } else {
      setPhase("setup");
    }
  };

  const current = pattern.phases[phaseIdx];

  return (
    <ScreenContainer title="Guided breathing" subtitle={phase === "running" ? pattern.name : undefined}>
      {phase !== "running" ? <BackButton onPress={() => navigation.goBack()} /> : null}

      {phase === "setup" ? (
        <>
          <Card style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textMuted, ...typography.label }}>PATTERN</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {BREATHING_PATTERNS.map((p) => (
                <Chip key={p.id} label={`${p.ratio}`} selected={p.id === patternId} onPress={() => setPatternId(p.id)} />
              ))}
            </View>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{pattern.name}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>{pattern.description}</Text>
            <Text style={{ color: colors.textMuted, ...typography.label, marginTop: spacing.sm }}>DURATION</Text>
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              {BREATHING_DURATIONS_MIN.map((m) => (
                <Chip key={m} label={`${m} min`} selected={m === minutes} onPress={() => setMinutes(m)} />
              ))}
            </View>
          </Card>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>{WELLNESS_NOTE}</Text>
          <Button label="Begin" onPress={start} />
        </>
      ) : null}

      {phase === "running" ? (
        <>
          <View style={{ alignItems: "center", justifyContent: "center", height: CIRCLE + 40 }}>
            <View style={{ width: CIRCLE, height: CIRCLE, alignItems: "center", justifyContent: "center" }}>
              <Animated.View
                accessibilityElementsHidden
                style={{
                  position: "absolute",
                  width: CIRCLE,
                  height: CIRCLE,
                  borderRadius: CIRCLE / 2,
                  backgroundColor: "rgba(34,211,238,0.18)",
                  borderWidth: 2,
                  borderColor: colors.cyan,
                  transform: [{ scale }],
                }}
              />
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: colors.textPrimary, ...typography.h1, fontSize: 28 }}
              >
                {current.label}
              </Text>
              <Text style={{ color: colors.textSecondary, ...typography.metricLarge, fontSize: 32 }}>{phaseLeft}</Text>
            </View>
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.body, textAlign: "center" }}>
            {formatMmSs(Math.max(0, totalSeconds - elapsed))} left
          </Text>
          <Button label="Stop" variant="secondary" onPress={stop} />
        </>
      ) : null}

      {phase === "done" ? (
        <>
          <Card style={{ alignItems: "center", gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Nicely done</Text>
            <Text style={{ color: colors.textSecondary, ...typography.body }}>
              {pattern.name} · {formatMmSs(elapsed)}
            </Text>
            <Text style={{ color: logger.isError ? colors.danger : colors.textMuted, ...typography.meta, textAlign: "center" }}>
              {logger.isPending
                ? "Logging your session..."
                : logger.isSuccess
                  ? "Logged as a mindfulness session (rounded to whole minutes)."
                  : logger.isError
                    ? extractErrorMessage(logger.error, "Couldn't log this session.")
                    : ""}
            </Text>
          </Card>
          {logger.isError ? (
            <Button
              label="Retry logging"
              variant="secondary"
              onPress={() => logger.mutate({ seconds: elapsed, type: "breathing", note: pattern.name })}
            />
          ) : null}
          <Button label="Again" variant="secondary" onPress={() => setPhase("setup")} />
          <Button label="Done" onPress={() => navigation.goBack()} />
        </>
      ) : null}
    </ScreenContainer>
  );
}
