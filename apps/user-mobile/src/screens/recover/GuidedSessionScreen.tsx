import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ProgressRing } from "../../components/ProgressRing";
import { EmptyState } from "../../components/EmptyState";
import { getRoutine, routineSeconds } from "../../content/recover";
import { useLogMindfulness } from "../../lib/useMindfulnessLog";
import { extractErrorMessage } from "../../lib/apiError";
import { formatMmSs } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";

type Props = NativeStackScreenProps<RecoverStackParamList, "GuidedSession">;

interface RunState {
  step: number;
  remaining: number;
  elapsed: number;
  done: boolean;
}

/**
 * Recover 08 (Active Guided Yoga) / 11 (Mindful practice session). Step timer
 * with a progress ring, pause and skip. On completion the session is posted to
 * POST /mindfulness-logs (whole minutes, type = routine kind, note = title).
 */
export function GuidedSessionScreen({ navigation, route }: Props) {
  const routine = getRoutine(route.params.routineId);
  const steps = routine?.steps ?? [];
  const [run, setRun] = useState<RunState>({ step: 0, remaining: steps[0]?.seconds ?? 0, elapsed: 0, done: false });
  const [paused, setPaused] = useState(false);
  const logger = useLogMindfulness();
  const loggedRef = useRef(false);

  useEffect(() => {
    if (!routine || paused || run.done) return;
    const id = setInterval(() => {
      setRun((prev) => {
        if (prev.done) return prev;
        const elapsed = prev.elapsed + 1;
        if (prev.remaining > 1) return { ...prev, remaining: prev.remaining - 1, elapsed };
        if (prev.step + 1 >= steps.length) return { ...prev, remaining: 0, elapsed, done: true };
        return { step: prev.step + 1, remaining: steps[prev.step + 1].seconds, elapsed, done: false };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [routine, paused, run.done, steps]);

  const postLog = () => {
    if (!routine) return;
    logger.mutate({ seconds: run.elapsed, type: routine.logType, note: routine.title });
  };

  useEffect(() => {
    if (run.done && routine && !loggedRef.current) {
      loggedRef.current = true;
      logger.mutate({ seconds: run.elapsed, type: routine.logType, note: routine.title });
    }
  }, [run.done]);

  if (!routine) {
    return (
      <ScreenContainer title="Session">
        <BackButton onPress={() => navigation.goBack()} />
        <EmptyState title="Routine not found" actionLabel="Back to library" onAction={() => navigation.navigate("YogaLibrary")} />
      </ScreenContainer>
    );
  }

  const skip = () =>
    setRun((prev) => {
      if (prev.done) return prev;
      if (prev.step + 1 >= steps.length) return { ...prev, remaining: 0, done: true };
      return { ...prev, step: prev.step + 1, remaining: steps[prev.step + 1].seconds };
    });

  const confirmEnd = () =>
    Alert.alert("End session?", "Your progress won't be logged unless you finish.", [
      { text: "Keep going", style: "cancel" },
      { text: "End", style: "destructive", onPress: () => navigation.goBack() },
    ]);

  if (run.done) {
    return (
      <ScreenContainer title="Session complete">
        <Card style={{ alignItems: "center", gap: spacing.sm }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.successSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="check" size={28} color={colors.success} strokeWidth={3} />
          </View>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{routine.title}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.body }}>
            {formatMmSs(run.elapsed)} of guided time
          </Text>
          <Text
            style={{
              color: logger.isError ? colors.danger : colors.textMuted,
              ...typography.meta,
              textAlign: "center",
            }}
          >
            {logger.isPending
              ? "Logging your session..."
              : logger.isSuccess
                ? "Logged as a mindfulness session (rounded to whole minutes)."
                : logger.isError
                  ? extractErrorMessage(logger.error, "Couldn't log this session.")
                  : ""}
          </Text>
        </Card>
        {logger.isError ? <Button label="Retry logging" variant="secondary" onPress={postLog} /> : null}
        <Button label="Done" onPress={() => navigation.navigate("YogaLibrary")} />
      </ScreenContainer>
    );
  }

  const current = steps[run.step];
  const stepProgress = 1 - run.remaining / current.seconds;
  const overall = Math.min(1, run.elapsed / routineSeconds(routine));

  return (
    <ScreenContainer title={routine.title} subtitle={`Step ${run.step + 1} of ${steps.length}`}>
      <View style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.md }}>
        <ProgressRing progress={stepProgress} size={220} strokeWidth={14} color={colors.aiAccent}>
          <Text style={{ color: colors.textPrimary, ...typography.metricLarge }}>{formatMmSs(run.remaining)}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>{paused ? "Paused" : "remaining"}</Text>
        </ProgressRing>
        <Text style={{ color: colors.textPrimary, ...typography.h1, textAlign: "center" }}>{current.title}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.body, textAlign: "center" }}>{current.instruction}</Text>
      </View>

      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
        <View style={{ height: 6, backgroundColor: colors.aiAccent, width: `${overall * 100}%` }} />
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Pressable
          onPress={() => setPaused((p) => !p)}
          accessibilityRole="button"
          accessibilityLabel={paused ? "Resume" : "Pause"}
          style={{
            flex: 1,
            height: 52,
            borderRadius: radius.md,
            backgroundColor: colors.accent,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.sm,
          }}
        >
          <Icon name={paused ? "play" : "pause"} size={18} color={colors.textOnAccent} />
          <Text style={{ color: colors.textOnAccent, ...typography.h3, fontSize: 15 }}>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel="Skip step"
          style={{
            flex: 1,
            height: 52,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.sm,
          }}
        >
          <Icon name="skip-forward" size={18} color={colors.textPrimary} />
          <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 15 }}>Skip</Text>
        </Pressable>
      </View>
      <Button label="End session" variant="secondary" onPress={confirmEnd} />
    </ScreenContainer>
  );
}
