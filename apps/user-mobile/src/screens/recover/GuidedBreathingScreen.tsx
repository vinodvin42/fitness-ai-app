import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import {
  BREATHING_DURATIONS_MIN,
  BREATHING_PATTERNS,
  BREATHING_SAFETY,
  DEFAULT_BREATHING_MIN,
  WELLNESS_NOTE,
} from "../../content/recover";
import { useLogMindfulness } from "../../lib/useMindfulnessLog";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, ProgressBar, RecoverShell } from "./parts";
import { clock } from "./GuidedSessionScreen";

type Props = NativeStackScreenProps<RecoverStackParamList, "GuidedBreathing">;

const MIN_SCALE = 0.8;
const RING = 200;

type Phase = "setup" | "running" | "done";

const PHASE_TEXT = { Inhale: "Breathe in", Hold: "Hold", Exhale: "Breathe out" } as const;

function canSpeak() {
  return Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window;
}
function say(text: string) {
  try {
    const synth = (window as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis;
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // optional
  }
}

/**
 * Recover 09 - Guided breathing. Defaults to Easy paced breathing (inhale 4 /
 * exhale 6, 5 minutes). A real second-by-second clock drives the phase, the
 * countdown and the breathing circle; pause / resume / end work. A finished
 * session (or one ended after a minute or more) is logged via
 * POST /mindfulness-logs.
 */
export function GuidedBreathingScreen({ navigation, route }: Props) {
  const [patternId, setPatternId] = useState(route.params?.patternId ?? BREATHING_PATTERNS[0].id);
  const [minutes, setMinutes] = useState<number>(DEFAULT_BREATHING_MIN);
  const [phase, setPhase] = useState<Phase>(route.params?.autoStart ? "running" : "setup");
  const pattern = BREATHING_PATTERNS.find((p) => p.id === patternId) ?? BREATHING_PATTERNS[0];
  const [clk, setClk] = useState({ idx: 0, left: pattern.phases[0].seconds, elapsed: 0 });
  const [paused, setPaused] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [voice, setVoice] = useState(false);
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const logger = useLogMindfulness();
  const loggedRef = useRef(false);
  const totalSeconds = minutes * 60;
  const { idx, left, elapsed } = clk;
  const current = pattern.phases[idx];

  // Drive the circle toward the phase's target over the time left in it; stop while paused.
  useEffect(() => {
    if (phase !== "running") return;
    if (paused) {
      scale.stopAnimation();
      return;
    }
    if (current.label === "Hold") return;
    Animated.timing(scale, {
      toValue: current.label === "Inhale" ? 1 : MIN_SCALE,
      duration: Math.max(1, left) * 1000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [phase, idx, paused]);

  useEffect(() => {
    if (phase !== "running" || paused) return;
    const id = setInterval(() => {
      setClk((prev) => {
        const nextElapsed = prev.elapsed + 1;
        if (prev.left > 1) return { ...prev, left: prev.left - 1, elapsed: nextElapsed };
        const i = (prev.idx + 1) % pattern.phases.length;
        return { idx: i, left: pattern.phases[i].seconds, elapsed: nextElapsed };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, paused, pattern]);

  const logOnce = (seconds: number) => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    logger.mutate({ seconds, type: "breathing", note: pattern.name });
  };

  useEffect(() => {
    if (phase === "running" && elapsed >= totalSeconds) {
      scale.stopAnimation();
      setPhase("done");
      logOnce(elapsed);
    }
  }, [elapsed, phase]);

  useEffect(() => {
    if (voice && canSpeak() && phase === "running" && !paused) say(PHASE_TEXT[current.label]);
  }, [idx, voice]);
  useEffect(
    () => () => {
      if (canSpeak()) (window as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis.cancel();
    },
    [],
  );

  const start = () => {
    scale.setValue(MIN_SCALE);
    logger.reset();
    loggedRef.current = false;
    setPaused(false);
    setConfirmEnd(false);
    setClk({ idx: 0, left: pattern.phases[0].seconds, elapsed: 0 });
    setPhase("running");
  };

  const endNow = (logIt: boolean) => {
    scale.stopAnimation();
    setConfirmEnd(false);
    if (logIt && elapsed >= 60) {
      setPhase("done");
      logOnce(elapsed);
    } else {
      navigation.goBack();
    }
  };

  const speakable = canSpeak();

  if (phase === "setup") {
    return (
      <RecoverShell title="Guided breathing" subtitle="Recover · Pick a pace" onBack={() => navigation.goBack()}>
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textMuted, ...typography.label }}>PATTERN</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {BREATHING_PATTERNS.map((p) => (
              <Chip
                key={p.id}
                label={p.id === "easy" ? "Easy paced" : p.name.replace(" breathing", "")}
                selected={p.id === patternId}
                onPress={() => setPatternId(p.id)}
              />
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
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{BREATHING_SAFETY}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{WELLNESS_NOTE}</Text>
        <ActionButton label="Begin" icon="play" onPress={start} style={{ height: 50 }} />
      </RecoverShell>
    );
  }

  if (phase === "done") {
    return (
      <RecoverShell title="Nicely done" onBack={() => navigation.goBack()}>
        <Card style={{ alignItems: "center", gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{pattern.name}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.body }}>{clock(elapsed)} of breathing</Text>
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
          <ActionButton
            label="Retry logging"
            variant="dark"
            onPress={() => logger.mutate({ seconds: elapsed, type: "breathing", note: pattern.name })}
          />
        ) : null}
        <ActionButton label="Again" variant="dark" onPress={() => setPhase("setup")} />
        <ActionButton label="Done" onPress={() => navigation.goBack()} />
      </RecoverShell>
    );
  }

  return (
    <RecoverShell
      title={pattern.name}
      subtitle={`${minutes}-minute guided session`}
      onBack={() => setConfirmEnd(true)}
      contentStyle={{ gap: spacing.sm + 2 }}
    >
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{clock(elapsed)} elapsed</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{clock(totalSeconds - elapsed)} remaining</Text>
        </View>
        <ProgressBar progress={elapsed / totalSeconds} />
      </View>

      <View style={{ height: RING + 24, alignItems: "center", justifyContent: "center" }}>
        <View
          style={{
            width: RING,
            height: RING,
            borderRadius: RING / 2,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Animated.View
            accessibilityElementsHidden
            style={{
              position: "absolute",
              width: RING - 28,
              height: RING - 28,
              borderRadius: (RING - 28) / 2,
              backgroundColor: colors.infoSurface,
              transform: [{ scale }],
            }}
          />
          <Text accessibilityLiveRegion="polite" style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>
            {paused ? "Paused" : PHASE_TEXT[current.label]}
          </Text>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 40 }}>{left}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 11 }}>seconds remaining</Text>
        </View>
      </View>

      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{pattern.cues[current.label]}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", fontSize: 12 }}>
          Sit comfortably and let your shoulders relax. Follow the circle only if the pace feels easy.
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
        }}
      >
        {pattern.phases.map((p, i) => (
          <React.Fragment key={`${p.label}-${i}`}>
            {i > 0 ? <Icon name="chevron-right" size={14} color={colors.accent} /> : null}
            <Text style={{ color: i === idx ? colors.textPrimary : colors.textSecondary, ...typography.meta, fontSize: 12 }}>
              {p.label} · {p.seconds} sec
            </Text>
          </React.Fragment>
        ))}
      </View>

      <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{BREATHING_SAFETY}</Text>

      {speakable ? (
        <Pressable
          onPress={() => setVoice((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: voice }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Icon name="volume-2" size={14} color={colors.accent} />
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>Voice guidance {voice ? "on" : "off"}</Text>
        </Pressable>
      ) : null}

      <ActionButton
        label={paused ? "Resume breathing" : "Pause breathing"}
        icon={paused ? "play" : "pause"}
        onPress={() => setPaused((p) => !p)}
        style={{ height: 50 }}
      />
      {confirmEnd ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textSecondary, ...typography.meta, textAlign: "center" }}>
            End this session? {elapsed >= 60 ? "Your time so far can be logged." : "Under a minute isn't logged."}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton label="Keep going" variant="dark" onPress={() => setConfirmEnd(false)} style={{ flex: 1 }} />
            <ActionButton
              label={elapsed >= 60 ? "End & log" : "End"}
              variant="outline"
              onPress={() => endNow(true)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <ActionButton label="End session" variant="dark" onPress={() => setConfirmEnd(true)} style={{ height: 50 }} />
      )}
    </RecoverShell>
  );
}
