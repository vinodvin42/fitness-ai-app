import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { ErrorState } from "../../components/ErrorState";
import { Icon, type IconName } from "../../components/Icon";
import { fetchProgramProgress } from "../../api/programPurchases";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ProgramCompletion">;

function SummaryRow({ label, value, delta, tone }: { label: string; value: string; delta?: string; tone?: "good" | "neutral" }) {
  const good = tone !== "neutral";
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{value}</Text>
      </View>
      {delta ? (
        <View style={{ backgroundColor: good ? colors.successSoft : colors.accentSoft, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ color: good ? colors.success : colors.accent, fontFamily: fonts.bodyBold, fontSize: 11 }}>{delta}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Milestone({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: "center", gap: 8 }}>
      <Icon name={icon} size={20} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, ...typography.meta, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

/**
 * Program Complete (Figma Programs 03). Summary rows are only rendered from
 * real data returned by GET /programs/:id/progress: weight (first vs last
 * logged weight inside the program window), body fat (user-entered values
 * only, so it is labelled "Body Fat", not estimated), and adherence
 * (completed sessions / planned, see the API's programProgress.logic.ts).
 * There is no Strength Index row: no honest definition exists in the data
 * yet. The recommendation is the plan engine's program for the user, else
 * the next catalog program. "Added to Your Life Timeline" is true: the
 * timeline derives a Program Complete event from the same sessions.
 */
export function ProgramCompletionScreen({ route, navigation }: Props) {
  const { programId } = route.params;
  const units = useMeasureUnits();
  const parent = navigation.getParent<NavigationProp<MainTabsParamList>>();
  const { data: progress, isLoading, isError, refetch } = useQuery({
    queryKey: ["program", programId, "progress"],
    queryFn: () => fetchProgramProgress(programId),
  });

  if (isError) {
    return (
      <ScreenContainer title="Program Complete">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }
  if (isLoading || !progress) {
    return (
      <ScreenContainer title="Program Complete">
        <BackButton onPress={() => navigation.goBack()} />
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (progress.status !== "completed") {
    return (
      <ScreenContainer title="Program Complete">
        <BackButton onPress={() => navigation.goBack()} />
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.body }}>
            {progress.program.name} isn't finished yet — {progress.completedWorkouts} of {progress.totalWorkouts} workouts complete.
          </Text>
          <Button label="View Progress" onPress={() => navigation.replace("ProgramProgress", { programId })} style={{ marginTop: spacing.md }} />
        </Card>
      </ScreenContainer>
    );
  }

  const weeks = progress.program.durationWeeks;
  const w = progress.weight;
  const bf = progress.bodyFat;
  const weightDelta = w ? Math.round((w.currentKg - w.startKg) * 10) / 10 : null;
  const bfDelta = bf ? Math.round((bf.currentPercent - bf.startPercent) * 10) / 10 : null;
  const lost = weightDelta !== null && weightDelta < 0 ? Math.abs(weightDelta) : null;
  const signed = (n: number, unit: string) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n)}${unit}`;
  const next = progress.nextProgram;
  const openCoaches = () => parent?.navigate("More", { screen: "CoachDiscovery", params: { serviceType: "fitness" } });

  return (
    <ScreenContainer title="Program Complete">
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ alignItems: "center", gap: 6, paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h1 }}>Program completed</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          {progress.program.name} · {weeks} {weeks === 1 ? "Week" : "Weeks"}
        </Text>
      </View>

      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Your Progress Summary</Text>
      <View style={{ gap: spacing.sm }}>
        {w && weightDelta !== null ? (
          <SummaryRow
            label={weightDelta < 0 ? "Weight Loss" : "Weight Change"}
            value={`Starting ${units.wt(w.startKg)}${units.wtUnit} → Current ${units.wt(w.currentKg)}${units.wtUnit}`}
            delta={signed(Math.round(units.wt(Math.abs(weightDelta)) * Math.sign(weightDelta) * 10) / 10, units.wtUnit)}
            tone={weightDelta <= 0 ? "good" : "neutral"}
          />
        ) : null}
        {bf && bfDelta !== null ? (
          <SummaryRow
            label="Body Fat"
            value={`${bf.startPercent}% → ${bf.currentPercent}%`}
            delta={signed(bfDelta, "%")}
            tone={bfDelta <= 0 ? "good" : "neutral"}
          />
        ) : null}
        {progress.adherencePercent != null ? (
          <SummaryRow label="Average Program Adherence" value={`Total ${weeks}-Week Compliance`} delta={`${progress.adherencePercent}%`} tone="neutral" />
        ) : null}
        <SummaryRow
          label="Workouts"
          value={`${progress.totalWorkouts} finished · ${progress.totalSetsLogged} sets logged`}
        />
      </View>

      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Program milestones</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Milestone icon="calendar" label={`${weeks}-week program`} />
        <Milestone icon="check" label="Program completed" />
        {lost !== null ? <Milestone icon="scale" label={`${units.wt(lost)}${units.wtUnit} Lost`} /> : null}
      </View>

      <View style={{ backgroundColor: colors.aiSurface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.aiBorder, padding: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="sparkles" size={14} color={colors.aiAccent} />
          <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6 }}>FYNROX RECOMMENDATION</Text>
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.label, lineHeight: 19 }}>
          {next
            ? `Based on your progress, we recommend ${next.name} (${next.durationWeeks} ${next.durationWeeks === 1 ? "week" : "weeks"}) as your next step.`
            : "You've finished every program available to you right now. A coach can help you plan what comes next."}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {next ? (
            <Pressable onPress={() => navigation.navigate("ProgramDetail", { programId: next.id })} accessibilityRole="button" style={{ backgroundColor: colors.aiAccent, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: colors.background, fontFamily: fonts.bodyBold, fontSize: 12 }}>View Program</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={openCoaches} accessibilityRole="button" style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12 }}>Explore Coaches</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => parent?.navigate("More", { screen: "TimelineOverview" })}
        accessibilityRole="button"
        accessibilityLabel="Open your Life Timeline"
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm }}
      >
        <Icon name="clock" size={14} color={colors.accent} />
        <Text style={{ color: colors.accent, ...typography.label }}>Added to Your Life Timeline</Text>
      </Pressable>
    </ScreenContainer>
  );
}
