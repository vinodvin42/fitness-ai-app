import React, { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AnalyticsRange, AcwrStatus } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { BackButton } from "../../components/BackButton";
import { SegmentedControl } from "../../components/SegmentedControl";
import { BarChart, DonutChart } from "../../components/Charts";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { StatTile } from "../../components/StatTile";
import { fetchTrainingAnalytics } from "../../api/trainingAnalytics";
import { useWorkoutSettings, kgToDisplay } from "../../api/workoutSettings";
import { colors, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "TrainingAnalytics">;

const RANGES = [
  { value: "4w", label: "4 weeks" },
  { value: "12w", label: "12 weeks" },
  { value: "26w", label: "26 weeks" },
] as const;

const SLICE_COLORS = [colors.accent, colors.success, colors.orange, colors.aiAccent, colors.pink, colors.cyan, colors.warning];

const ACWR_COPY: Record<AcwrStatus, { label: string; tone: "warning" | "success" | "danger"; body: string }> = {
  low: {
    label: "Low",
    tone: "warning",
    body: "Your recent load is below your longer-term average. Fine for a deload; build back gradually if you want to progress.",
  },
  optimal: {
    label: "Optimal",
    tone: "success",
    body: "Your recent load is in line with what you have been doing. A good zone to keep progressing in.",
  },
  high: {
    label: "High",
    tone: "danger",
    body: "Your recent load is well above your longer-term average. Consider an easier session or extra recovery.",
  },
};

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Training Analytics (Train 12) - GET /training/analytics. Weekly volume,
 * ACWR (acute:chronic workload ratio, hidden behind an honest "needs history"
 * state when the API returns null), muscle distribution and PRs. All numbers
 * come from the API; nothing is estimated client-side.
 */
export function TrainingAnalyticsScreen({ navigation }: Props) {
  const [range, setRange] = useState<AnalyticsRange>("12w");
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 600) - 2 * (spacing.md + spacing.md);
  const { data: settings } = useWorkoutSettings();
  const unit = settings?.weightUnit ?? "kg";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["trainingAnalytics", range],
    queryFn: () => fetchTrainingAnalytics(range),
  });

  return (
    <ScreenContainer title="Training Analytics" subtitle="Volume, load balance and records">
      <BackButton onPress={() => navigation.goBack()} />
      <SegmentedControl options={RANGES} value={range} onChange={setRange} />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={90} />
          <Skeleton height={200} />
          <Skeleton height={140} />
        </View>
      ) : data.totalSessions === 0 ? (
        <EmptyState
          title="No training data yet"
          subtitle="Complete a workout and your volume, muscle balance and personal records will show up here."
          actionLabel="Browse programs"
          onAction={() => navigation.navigate("ProgramsMarketplace")}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StatTile icon="dumbbell" label="Sessions" value={data.totalSessions} />
            <StatTile icon="activity" label="Sets" value={data.totalSets} tint={colors.success} tintSoft={colors.successSoft} />
            <StatTile
              icon="trending-up"
              label={`Volume (${unit})`}
              value={Math.round(kgToDisplay(data.totalVolumeKg, unit)).toLocaleString()}
              tint={colors.aiAccent}
              tintSoft={colors.aiAccentSoft}
            />
          </View>

          <Card>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Weekly volume</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta, marginBottom: spacing.sm }}>
              Total weight lifted per week ({unit}), weeks starting on Monday
            </Text>
            {data.weeks.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No weekly data in this range.</Text>
            ) : (
              <BarChart
                data={data.weeks.map((w) => ({ label: weekLabel(w.weekStart), value: Math.round(kgToDisplay(w.volumeKg, unit)) }))}
                width={chartWidth}
                accessibilityLabel={`Weekly training volume in ${unit} for the last ${range}`}
              />
            )}
          </Card>

          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Load balance (ACWR)</Text>
              {data.acwr ? <Pill label={ACWR_COPY[data.acwr.status].label} tone={ACWR_COPY[data.acwr.status].tone} /> : null}
            </View>
            {data.acwr ? (
              <>
                <Text style={{ color: colors.textPrimary, ...typography.metricLarge, marginTop: spacing.xs }}>
                  {data.acwr.ratio.toFixed(2)}
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>{ACWR_COPY[data.acwr.status].body}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
                  Acute (recent) load {Math.round(data.acwr.acuteLoad)} vs chronic (longer-term) load {Math.round(data.acwr.chronicLoad)}.
                  A general guide, not medical advice.
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                Not available yet. The load balance needs about 14 days of training history to be meaningful. Keep logging
                workouts and it will appear here.
              </Text>
            )}
          </Card>

          <Card>
            <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Muscle distribution</Text>
            {data.muscleDistribution.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No sets logged in this range.</Text>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <DonutChart
                  size={130}
                  slices={data.muscleDistribution.map((m, i) => ({
                    label: m.muscleGroup,
                    value: m.sets,
                    color: SLICE_COLORS[i % SLICE_COLORS.length],
                  }))}
                  centerLabel={`${data.totalSets} sets`}
                  accessibilityLabel={`Sets by muscle group: ${data.muscleDistribution
                    .map((m) => `${m.muscleGroup} ${Math.round(m.percent)} percent`)
                    .join(", ")}`}
                />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  {data.muscleDistribution.map((m, i) => (
                    <View key={m.muscleGroup} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                      <Text style={{ color: colors.textPrimary, flex: 1, textTransform: "capitalize" }}>{m.muscleGroup}</Text>
                      <Text style={{ color: colors.textSecondary }}>{Math.round(m.percent)}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Card>

          <Card>
            <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Personal records</Text>
            {data.personalRecords.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>No records yet. Log weighted sets to start tracking them.</Text>
            ) : (
              data.personalRecords.map((pr, i) => (
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
              ))
            )}
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}
