import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProgramProgressDetail } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { ProgressRing } from "../../components/ProgressRing";
import { fetchProgramProgress } from "../../api/programPurchases";
import { fetchReadiness } from "../../api/recovery";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ProgramProgress">;

const DAYS = [
  { key: "mon", letter: "M" },
  { key: "tue", letter: "T" },
  { key: "wed", letter: "W" },
  { key: "thu", letter: "T" },
  { key: "fri", letter: "F" },
  { key: "sat", letter: "S" },
  { key: "sun", letter: "S" },
] as const;

const BAND_LABEL = { ready: "Good", moderate: "Moderate", rest: "Low" } as const;
const BAND_COLOR = { ready: colors.success, moderate: colors.warning, rest: colors.danger } as const;

interface Insight {
  text: string;
  why: string;
}

/**
 * Rule-based insight from this week's real numbers (no AI call): all planned
 * workouts done -> adherence is strong; nothing like half done with most of
 * the week gone -> behind; meal logging on under half the elapsed days ->
 * nutrition nudge. Returns null when no rule fires, and the card is hidden.
 */
function buildInsight(p: ProgramProgressDetail): Insight | null {
  const planned = p.plannedPerWeek ?? 0;
  const done = p.completedSessionsThisWeek ?? 0;
  if (!p.weekNumber || planned <= 0) return null;
  if (done >= planned) {
    return {
      text: `You've completed all ${planned} planned workouts this week. Keep the rhythm going.`,
      why: `Rule: completed sessions this program week (${done}) reached your planned ${planned} per week, which is based on your training days.`,
    };
  }
  const nutrition = p.nutritionLoggedDays;
  const weekStart = p.startedAt ? new Date(p.startedAt).getTime() + (p.weekNumber - 1) * 7 * 24 * 60 * 60 * 1000 : null;
  const daysElapsed = weekStart ? Math.min(7, Math.max(1, Math.ceil((Date.now() - weekStart) / (24 * 60 * 60 * 1000)))) : 0;
  if (daysElapsed >= 5 && done < planned / 2) {
    return {
      text: `You're behind this week: ${done} of ${planned} planned workouts done. Consider rescheduling your remaining workouts.`,
      why: `Rule: day ${daysElapsed} of 7 of this program week with fewer than half of your planned ${planned} workouts completed.`,
    };
  }
  if (nutrition && nutrition.elapsed >= 3 && nutrition.logged / nutrition.elapsed < 0.5) {
    return {
      text: "Your training is on track. Logging your meals more often will help you see what's driving results.",
      why: `Rule: meals were logged on ${nutrition.logged} of ${nutrition.elapsed} days so far this program week (under half).`,
    };
  }
  return null;
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 }}>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
      <Text style={{ color: color ?? colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 15 }}>{value}</Text>
    </View>
  );
}

/**
 * Program Progress (Figma Programs 02). Everything is derived from real data
 * returned by GET /programs/:id/progress (see programProgress.logic.ts in the
 * API for the week / planned-per-week / schedule definitions): the ring is
 * completed workouts of the program, Training is this program week's
 * completed sessions vs planned, Nutrition is the share of elapsed days this
 * week with a meal logged (hidden when none were logged), Recovery is the
 * current readiness band (hidden without recovery data). The Insight card is
 * rule-based and hidden when no rule fires; Accept is remembered per program
 * week on this device.
 */
export function ProgramProgressScreen({ route, navigation }: Props) {
  const { programId } = route.params;
  const { data: progress, isLoading, isError, refetch } = useQuery({
    queryKey: ["program", programId, "progress"],
    queryFn: () => fetchProgramProgress(programId),
  });
  const readiness = useQuery({ queryKey: ["recovery", "readiness"], queryFn: fetchReadiness });
  const [showWhy, setShowWhy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const insightKey = progress?.weekNumber ? `primefit.programInsight.${programId}.${progress.weekNumber}` : null;

  useEffect(() => {
    if (!insightKey) return;
    AsyncStorage.getItem(insightKey)
      .then((v) => setAccepted(v === "1"))
      .catch(() => undefined);
  }, [insightKey]);

  if (isError) {
    return (
      <ScreenContainer title="Program Progress">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }
  if (isLoading || !progress) {
    return (
      <ScreenContainer title="Program Progress">
        <BackButton onPress={() => navigation.goBack()} />
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const percent = progress.totalWorkouts > 0 ? Math.round((progress.completedWorkouts / progress.totalWorkouts) * 100) : 0;
  const planned = progress.plannedPerWeek ?? 0;
  const doneThisWeek = Math.min(progress.completedSessionsThisWeek ?? 0, planned);
  const nutrition = progress.nutritionLoggedDays;
  const nutritionPct = nutrition ? Math.round((nutrition.logged / nutrition.elapsed) * 100) : null;
  const band = readiness.data?.band ?? null;
  const schedule = progress.schedule ?? [];
  const dayState = new Map<string, boolean>();
  for (const item of schedule) if (item.day) dayState.set(item.day, item.done);
  const insight = buildInsight(progress);
  const nextWorkout = schedule.find((s) => !s.done);

  const onContinue = () => {
    if (nextWorkout) navigation.navigate("WorkoutDetail", { workoutId: nextWorkout.workoutId });
    else navigation.navigate("ProgramDetail", { programId });
  };
  const onAccept = () => {
    setAccepted(true);
    if (insightKey) AsyncStorage.setItem(insightKey, "1").catch(() => undefined);
  };

  return (
    <ScreenContainer title="Program Progress">
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, flex: 1 }}>{progress.program.name}</Text>
        {progress.weekNumber ? (
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6 }}>
              {`WEEK ${progress.weekNumber} OF ${progress.program.durationWeeks}`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
        <ProgressRing progress={percent / 100} size={150} strokeWidth={10}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.display, fontSize: 30 }}>{percent}%</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>Completed</Text>
        </ProgressRing>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
          {progress.completedWorkouts} of {progress.totalWorkouts} workouts complete
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {planned > 0 ? <Tile label="Training" value={`${doneThisWeek}/${planned} done`} /> : null}
        {nutritionPct !== null ? <Tile label="Nutrition" value={`${nutritionPct}%`} color={colors.accent} /> : null}
        {band ? <Tile label="Recovery" value={BAND_LABEL[band]} color={BAND_COLOR[band]} /> : null}
      </View>

      {schedule.length > 0 ? (
        <>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>This Week's Schedule</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md }}>
            {dayState.size > 0 ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {DAYS.map((d) => {
                  const state = dayState.get(d.key);
                  return (
                    <View key={d.key} style={{ alignItems: "center", gap: 6, width: 28 }}>
                      <Text style={{ color: colors.textMuted, ...typography.meta }}>{d.letter}</Text>
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          borderWidth: 2,
                          borderColor: state === undefined ? colors.border : colors.accent,
                          backgroundColor: state ? colors.accent : "transparent",
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            ) : null}
            <View style={{ gap: 10 }}>
              {schedule.map((item, i) => (
                <View key={`${item.workoutId}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: item.done ? colors.accent : colors.textMuted }} />
                  <Text style={{ color: colors.textPrimary, ...typography.label, flex: 1 }}>{item.name}</Text>
                  <Text style={{ color: item.done ? colors.success : colors.textMuted, ...typography.meta }}>{item.done ? "Done" : "Pending"}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {insight && !accepted ? (
        <View style={{ backgroundColor: colors.aiSurface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.aiBorder, padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="sparkles" size={14} color={colors.aiAccent} />
            <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6 }}>23PRIMEFIT INSIGHT</Text>
          </View>
          <Text style={{ color: colors.textPrimary, ...typography.label, lineHeight: 19 }}>{insight.text}</Text>
          {showWhy ? <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 18 }}>{insight.why}</Text> : null}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable onPress={onAccept} accessibilityRole="button" style={{ backgroundColor: colors.aiAccent, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: colors.background, fontFamily: fonts.bodyBold, fontSize: 12 }}>Accept</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("WorkoutSettings")}
              accessibilityRole="button"
              style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12 }}>Adjust</Text>
            </Pressable>
            <Pressable onPress={() => setShowWhy((v) => !v)} accessibilityRole="button" style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12 }}>Why?</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {progress.status === "completed" ? (
        <Button label="View Completion" onPress={() => navigation.replace("ProgramCompletion", { programId })} />
      ) : (
        <Button label="Continue Program" onPress={onContinue} />
      )}
    </ScreenContainer>
  );
}
