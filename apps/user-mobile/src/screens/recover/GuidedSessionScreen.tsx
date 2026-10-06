import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import { BrandMark } from "../../components/BrandMark";
import { EmptyState } from "../../components/EmptyState";
import { getRoutine, routineSeconds } from "../../content/recover";
import { useLogMindfulness } from "../../lib/useMindfulnessLog";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, layout, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, PracticeArt, ProgressBar, RecoverShell } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "GuidedSession">;

interface RunState {
  step: number;
  remaining: number;
  elapsed: number;
  done: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const clock = (s: number) => `${pad(Math.floor(Math.max(0, s) / 60))}:${pad(Math.max(0, s) % 60)}`;

/** Browser speech synthesis, when present (web). Native has no TTS module in this build. */
function speechAvailable(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window;
}
function speak(text: string) {
  try {
    const synth = (window as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis;
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // speech is a nice-to-have only
  }
}
function stopSpeech() {
  try {
    (window as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

function PulseLogo() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ height: 150, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden>
      <Animated.View
        style={{
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: colors.accent,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.22] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] }) }],
        }}
      />
      <BrandMark size={72} />
    </View>
  );
}

/**
 * Recover 08 (Active guided yoga / mobility) and 11 (Mindful practice). Real
 * per-step timers with pause / resume / skip / end. A finished session - or one
 * ended after at least a minute - is posted to POST /mindfulness-logs.
 */
export function GuidedSessionScreen({ navigation, route }: Props) {
  const routine = getRoutine(route.params.routineId);
  const steps = routine?.steps ?? [];
  const [run, setRun] = useState<RunState>({ step: 0, remaining: steps[0]?.seconds ?? 0, elapsed: 0, done: false });
  const [paused, setPaused] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [voice, setVoice] = useState(false);
  const logger = useLogMindfulness();
  const loggedRef = useRef(false);
  const canSpeak = speechAvailable();

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

  const logOnce = (seconds: number) => {
    if (!routine || loggedRef.current) return;
    loggedRef.current = true;
    logger.mutate({ seconds, type: routine.logType, note: routine.title });
  };

  useEffect(() => {
    if (run.done) logOnce(run.elapsed);
  }, [run.done]);

  // Spoken cue on each step change (only when the user turned voice on).
  useEffect(() => {
    if (voice && canSpeak && routine && !run.done && !paused) speak(`${steps[run.step].title}. ${steps[run.step].instruction}`);
  }, [run.step, voice]);
  useEffect(() => () => (speechAvailable() ? stopSpeech() : undefined), []);
  useEffect(() => {
    if (paused && canSpeak) stopSpeech();
  }, [paused, canSpeak]);

  if (!routine) {
    return (
      <RecoverShell title="Session" onBack={() => navigation.goBack()}>
        <EmptyState title="Routine not found" actionLabel="Back to library" onAction={() => navigation.navigate("YogaLibrary")} />
      </RecoverShell>
    );
  }

  const total = routineSeconds(routine);
  const skip = () =>
    setRun((prev) => {
      if (prev.done) return prev;
      if (prev.step + 1 >= steps.length) return { ...prev, remaining: 0, done: true };
      return { ...prev, step: prev.step + 1, remaining: steps[prev.step + 1].seconds };
    });

  const endNow = (logIt: boolean) => {
    if (canSpeak) stopSpeech();
    if (logIt) logOnce(run.elapsed);
    navigation.goBack();
  };

  if (run.done) {
    return (
      <RecoverShell title="Session complete" onBack={() => navigation.navigate("YogaLibrary")}>
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
          <Text style={{ color: colors.textSecondary, ...typography.body }}>{clock(run.elapsed)} of guided time</Text>
          <Text
            style={{ color: logger.isError ? colors.danger : colors.textMuted, ...typography.meta, textAlign: "center" }}
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
        {logger.isError ? (
          <ActionButton
            label="Retry logging"
            variant="dark"
            onPress={() => logger.mutate({ seconds: run.elapsed, type: routine.logType, note: routine.title })}
          />
        ) : null}
        <ActionButton label="Done" onPress={() => navigation.navigate("YogaLibrary")} />
      </RecoverShell>
    );
  }

  const current = steps[run.step];
  // Position in the routine (skipped time counts here; `run.elapsed` is only time actually practised, used for logging).
  const pos = steps.slice(0, run.step).reduce((a, x) => a + x.seconds, 0) + current.seconds - run.remaining;
  const next = steps[run.step + 1];
  const mindful = routine.kind === "mindful";
  const controls = (
    <View style={{ gap: spacing.sm }}>
      <ActionButton
        label={paused ? "Resume session" : "Pause session"}
        icon={paused ? "play" : "pause"}
        onPress={() => setPaused((p) => !p)}
        style={{ height: 50 }}
      />
      {confirmEnd ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textSecondary, ...typography.meta, textAlign: "center" }}>
            End this session? {run.elapsed >= 60 ? "Your time so far can be logged." : "Under a minute isn't logged."}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton label="Keep going" variant="dark" onPress={() => setConfirmEnd(false)} style={{ flex: 1 }} />
            <ActionButton
              label={run.elapsed >= 60 ? "End & log" : "End"}
              variant="outline"
              onPress={() => endNow(run.elapsed >= 60)}
              style={{ flex: 1 }}
            />
          </View>
          {run.elapsed >= 60 ? <ActionButton label="End without logging" variant="dark" onPress={() => endNow(false)} /> : null}
        </View>
      ) : (
        <ActionButton label="End session" variant="dark" onPress={() => setConfirmEnd(true)} style={{ height: 50 }} />
      )}
    </View>
  );

  if (mindful) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{
            width: "100%",
            maxWidth: layout.maxContentWidth,
            alignSelf: "center",
            padding: layout.screenPadding,
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Pressable
              onPress={() => (run.elapsed > 0 ? setConfirmEnd(true) : navigation.goBack())}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: colors.surfaceRaised,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="chevron-left" size={18} color={colors.textPrimary} />
            </Pressable>
            <BrandMark size={34} withName />
          </View>
          <Text style={{ color: colors.accent, ...typography.caption }}>Recover / Mindful practice</Text>
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>{routine.title}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>{routine.description}</Text>
          </View>
          <PulseLogo />
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{current.title}</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {paused ? "Paused · " : ""}
              {Math.floor(pos / 60)}:{pad(pos % 60)} elapsed · {Math.round(total / 60)}:00 practice
            </Text>
          </View>
          <ProgressBar progress={pos / total} />
          <Card style={{ gap: 6 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 13 }}>What you&apos;re hearing</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 18 }}>
              &ldquo;{current.instruction}&rdquo;
            </Text>
          </Card>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{routine.safetyBody}</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11, textAlign: "center" }}>
            You can pause or finish whenever you need.
          </Text>
          {controls}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <RecoverShell
      title={routine.title}
      subtitle={`Guided session · ${routine.kind === "mobility" ? "Step" : "Pose"} ${run.step + 1} of ${steps.length}`}
      onBack={() => setConfirmEnd(true)}
      contentStyle={{ gap: spacing.sm + 2 }}
    >
      <View style={{ gap: 4 }}>
        <ProgressBar progress={pos / total} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{clock(pos)} elapsed</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{clock(total - pos)} remaining</Text>
        </View>
      </View>
      <PracticeArt height={150} icon={routine.kind === "mobility" ? "activity" : "flower"} />
      <Card style={{ gap: 6, borderColor: colors.accentSoft }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={{ color: colors.accent, ...typography.caption, letterSpacing: 0.6 }}>
            CURRENT {routine.kind === "mobility" ? "STEP" : "POSE"}
          </Text>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>
            {paused ? "Paused · " : ""}
            {clock(run.remaining)} left
          </Text>
        </View>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>{current.title}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>{current.instruction}</Text>
        {current.easier ? (
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>Easier option: {current.easier}</Text>
        ) : null}
      </Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 24 }}>
        {canSpeak ? (
          <Pressable
            onPress={() => {
              if (voice) stopSpeech();
              setVoice((v) => !v);
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: voice }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Icon name="volume-2" size={14} color={colors.accent} />
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>Voice guidance {voice ? "on" : "off"}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel={routine.kind === "mobility" ? "Skip step" : "Skip pose"}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Text style={{ color: colors.accent, ...typography.label }}>{routine.kind === "mobility" ? "Skip step" : "Skip pose"}</Text>
          <Icon name="chevron-right" size={14} color={colors.accent} />
        </Pressable>
      </View>
      <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 12 }}>
        {next ? `Up next: ${next.title} · ${Math.round(next.seconds / 60)} min` : "Last one - then you're done."}
      </Text>
      <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>
        Stay within a comfortable range. Stop if you feel pain.
      </Text>
      {controls}
    </RecoverShell>
  );
}

