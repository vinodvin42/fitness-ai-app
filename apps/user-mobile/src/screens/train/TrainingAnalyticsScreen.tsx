import React, { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AnalyticsRange, AcwrStatus } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { BackButton } from "../../components/BackButton";
import { Icon } from "../../components/Icon";
import { LineChart } from "../../components/Charts";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { fetchTrainingAnalytics } from "../../api/trainingAnalytics";
import { fetchWorkoutHistory } from "../../api/workoutSessions";
import { useWorkoutSettings, kgToDisplay } from "../../api/workoutSettings";
import { sessionsToCsv, shareCsv } from "../../lib/exportCsv";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "TrainingAnalytics">;

// Figma tabs 1W 1M 2M 6M 1Y -> API ranges.
const RANGES: Array<{ value: AnalyticsRange; label: string; long: string }> = [
  { value: "1w", label: "1W", long: "last week" },
  { value: "4w", label: "1M", long: "last 4 weeks" },
  { value: "8w", label: "2M", long: "last 8 weeks" },
  { value: "26w", label: "6M", long: "last 6 months" },
  { value: "52w", label: "1Y", long: "last year" },
];

const ACWR_COPY: Record<AcwrStatus, string> = {
  low: "Your recent load is below your longer-term average. Fine for a deload; build back gradually if you want to progress.",
  optimal: "Your recent load is in line with what you have been doing. A good zone to keep progressing in.",
  high: "Your recent load is well above your longer-term average. Consider an easier session or extra recovery.",
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Training Analytics (Figma Train 12) - GET /training/analytics. Every number
 * is computed by the API from logged sets and sessions; consistency is
 * sessions done this week vs the user's own planned days per week. "Export
 * Data" shares a CSV of the user's workout sessions.
 */
export function TrainingAnalyticsScreen({ navigation }: Props) {
  const [range, setRange] = useState<AnalyticsRange>("4w");
  const { width } = useWindowDimensions();
  const { colors: theme } = useTheme();
  const toast = useToast();
  const chartWidth = Math.min(width, 600) - 2 * spacing.md - 2 * spacing.md;
  const { data: settings } = useWorkoutSettings();
  const unit = settings?.weightUnit ?? "kg";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["trainingAnalytics", range],
    queryFn: () => fetchTrainingAnalytics(range),
  });

  const exportData = useMutation({
    mutationFn: async () => {
      const entries = await fetchWorkoutHistory();
      if (entries.length === 0) return "empty" as const;
      await shareCsv("23primefit-workouts.csv", sessionsToCsv(entries));
      return "ok" as const;
    },
    onSuccess: (r) => r === "empty" && toast.show("No workouts to export yet.", "info"),
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't export your data."), "error"),
  });

  const change = data?.volumeChangePercent ?? null;
  const rangeLong = RANGES.find((r) => r.value === range)?.long ?? "";
  const maxMuscle = Math.max(1, ...(data?.muscleDistribution ?? []).map((m) => m.percent));

  return (
    <ScreenContainer
      title="Training Analytics"
      right={
        <Pressable
          onPress={() => exportData.mutate()}
          disabled={exportData.isPending}
          accessibilityRole="button"
          accessibilityLabel="Export workout data as CSV"
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, opacity: exportData.isPending ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>Export Data</Text>
        </Pressable>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 3 }}>
        {RANGES.map((r) => {
          const on = r.value === range;
          return (
            <Pressable
              key={r.value}
              onPress={() => setRange(r.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={r.long}
              style={{ flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: on ? colors.surfaceHigh : "transparent" }}
            >
              <Text style={{ color: on ? colors.textPrimary : colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12 }}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={190} />
          <Skeleton height={110} />
          <Skeleton height={140} />
        </View>
      ) : data.totalSessions === 0 && data.consistency.completedThisWeek === 0 ? (
        <EmptyState
          title="No training data yet"
          subtitle="Complete a workout and your volume, consistency and muscle balance will show up here."
          actionLabel="Browse programs"
          onAction={() => navigation.navigate("ProgramsMarketplace")}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Weekly Volume Trend ({unit})</Text>
            {change !== null ? (
              <Text style={{ color: change >= 0 ? colors.success : colors.danger, fontFamily: fonts.bodySemi, fontSize: 11 }}>
                {change >= 0 ? "+" : ""}
                {change}% vs previous {rangeLong.replace("last ", "")}
              </Text>
            ) : null}
          </View>
          <Card style={{ paddingHorizontal: spacing.md }}>
            {data.totalSets === 0 ? (
              <Text style={{ color: colors.textMuted }}>No sets logged in this range.</Text>
            ) : (
              <LineChart
                data={data.weeks.map((w, i) => ({ label: `Week ${i + 1}`, value: Math.round(kgToDisplay(w.volumeKg, unit)) }))}
                width={chartWidth}
                height={150}
                color={theme.accent}
                accessibilityLabel={`Weekly training volume in ${unit} for the ${rangeLong}`}
              />
            )}
          </Card>

          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Weekly Consistency</Text>
          <Card style={{ gap: spacing.sm }}>
            {data.consistency.percent === null ? (
              <>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 26 }}>-</Text>
                <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
                  Pick your training days in Preferences and your weekly consistency will show here. You have completed{" "}
                  {data.consistency.completedThisWeek} workout{data.consistency.completedThisWeek === 1 ? "" : "s"} this week.
                </Text>
                <Pressable onPress={() => navigation.navigate("WorkoutSettings")} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: theme.accent, ...typography.label }}>Open Preferences</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.success, fontFamily: fonts.displayBold, fontSize: 28 }}>{data.consistency.percent}%</Text>
                  <View style={{ backgroundColor: colors.successSoft, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: colors.success, fontFamily: fonts.bodySemi, fontSize: 10 }}>
                      {data.consistency.completedThisWeek} of {data.consistency.plannedPerWeek} workouts completed
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
                  You completed {data.consistency.completedThisWeek} out of {data.consistency.plannedPerWeek} planned workouts this week.
                </Text>
              </>
            )}
          </Card>

          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Muscle Group Load</Text>
          <Card style={{ gap: spacing.md }}>
            {data.muscleDistribution.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No sets logged in this range.</Text>
            ) : (
              data.muscleDistribution.map((m) => (
                <View key={m.muscleGroup} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 12 }}>{cap(m.muscleGroup)}</Text>
                    <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12 }}>{Math.round(m.percent)}%</Text>
                  </View>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceHigh }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.accent, width: `${(m.percent / maxMuscle) * 100}%` }} />
                  </View>
                </View>
              ))
            )}
            {data.muscleDistribution.length > 0 ? (
              <Text style={{ color: colors.textMuted, ...typography.meta }}>Share of working sets in this range.</Text>
            ) : null}
          </Card>

          <Card style={{ borderColor: colors.aiBorder, backgroundColor: colors.aiSurface, gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="sparkles" size={13} color={colors.aiAccent} />
              <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6 }}>23PRIMEFIT RECOMMENDATION</Text>
            </View>
            {data.acwr ? (
              <>
                <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
                  Load balance {data.acwr.ratio.toFixed(2)} ({data.acwr.status}). {ACWR_COPY[data.acwr.status]}
                </Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  Acute load {Math.round(data.acwr.acuteLoad)} vs chronic {Math.round(data.acwr.chronicLoad)}. A general guide, not medical advice.
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
                Load balance needs about two weeks of training history. Keep logging workouts and a recommendation will appear here.
              </Text>
            )}
          </Card>

          {data.personalRecords.length > 0 ? (
            <>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Personal Records</Text>
              <Card>
                {data.personalRecords.slice(0, 8).map((pr, i) => (
                  <View
                    key={pr.exerciseId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: spacing.sm,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary }}>{pr.exerciseName}</Text>
                      <Text style={{ color: colors.textMuted, ...typography.meta }}>
                        {pr.muscleGroup} · {fmtDate(pr.achievedAt)}
                      </Text>
                    </View>
                    <Text style={{ color: colors.success, ...typography.h3 }}>
                      {kgToDisplay(pr.weightKg, unit)}
                      {unit} x {pr.reps}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
