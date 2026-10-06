import React, { useMemo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BodyMeasurement } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { LineChart, ChartPoint } from "../../components/Charts";
import { fetchMeasurements } from "../../api/progress";
import { fetchOnboardingProfile } from "../../api/users";
import { colors, layout, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "BodyComposition">;

type MetricKey = "weightKg" | "bodyFatPercent" | "waistCm" | "hipsCm";

const METRICS: Array<{ key: MetricKey; label: string; unit: string; color: string }> = [
  { key: "weightKg", label: "Weight", unit: "kg", color: colors.accent },
  { key: "bodyFatPercent", label: "Body fat", unit: "%", color: colors.orange },
  { key: "waistCm", label: "Waist", unit: "cm", color: colors.success },
  { key: "hipsCm", label: "Hips", unit: "cm", color: colors.aiAccent },
];

function seriesOf(rows: BodyMeasurement[], key: MetricKey): Array<{ at: string; value: number }> {
  return rows
    .filter((r) => r[key] != null)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
    .map((r) => ({ at: r.loggedAt, value: r[key] as number }));
}

/**
 * Body Composition (More menu, Figma Today 05): weight, body-fat %, waist and
 * hips trends from the user's real BodyMeasurement log (progress/measurements),
 * rendered with the shared Charts kit. Metrics the user has never logged are
 * simply not shown - no estimated or placeholder values.
 */
export function BodyCompositionScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const measurements = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });
  const profile = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile, staleTime: 60_000 });

  const series = useMemo(
    () => METRICS.map((m) => ({ ...m, points: seriesOf(measurements.data ?? [], m.key) })).filter((m) => m.points.length > 0),
    [measurements.data],
  );
  const target = profile.data?.targetWeightKg ?? null;

  return (
    <ScreenContainer title="Body Composition" subtitle="Weight, body fat and measurement trends">
      <BackButton onPress={() => navigation.goBack()} />
      {measurements.isLoading ? (
        <SkeletonCard lines={4} />
      ) : measurements.isError ? (
        <ErrorState message="Couldn't load your measurements." onRetry={() => measurements.refetch()} />
      ) : series.length === 0 ? (
        <EmptyState
          title="No measurements yet"
          subtitle="Log your weight, body fat or tape measurements to see your trends here."
          actionLabel="Log measurement"
          onAction={() => navigation.navigate("LogMeasurement")}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {series.map((m) => {
              const latest = m.points[m.points.length - 1].value;
              const first = m.points[0].value;
              const delta = Math.round((latest - first) * 10) / 10;
              return (
                <Card key={m.key} style={{ width: "48%", flexGrow: 1, gap: 2, padding: spacing.md }}>
                  <Text style={{ color: colors.textSecondary, ...typography.meta }}>{m.label}</Text>
                  <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>
                    {latest}
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}> {m.unit}</Text>
                  </Text>
                  <Text style={{ color: colors.textMuted, ...typography.caption }}>
                    {m.points.length > 1 ? `${delta > 0 ? "+" : ""}${delta} ${m.unit} since first log` : "First log"}
                  </Text>
                </Card>
              );
            })}
          </View>

          {target != null ? (
            <Card style={{ padding: spacing.md }}>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>Goal weight</Text>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{target} kg</Text>
            </Card>
          ) : null}

          {series
            .filter((m) => m.points.length > 1)
            .map((m) => {
              const data: ChartPoint[] = m.points.slice(-8).map((p) => ({
                label: new Date(p.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                value: p.value,
              }));
              return (
                <Card key={m.key} style={{ gap: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
                    {m.label} trend ({m.unit})
                  </Text>
                  <LineChart
                    data={data}
                    width={chartWidth}
                    color={m.color}
                    accessibilityLabel={`${m.label} trend chart: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
                  />
                </Card>
              );
            })}

          <Button label="Log measurement" variant="secondary" onPress={() => navigation.navigate("LogMeasurement")} />
        </View>
      )}
    </ScreenContainer>
  );
}
