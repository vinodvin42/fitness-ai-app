import React, { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { LongTermTrends } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { LineChart } from "../../components/Charts";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchLongTermTrends } from "../../api/healthspan";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, layout, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "HealthTrends">;
type Row = LongTermTrends["items"][number];
type Field = Exclude<keyof Row, "month">;

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/**
 * Long-term trends (25 Oct 2026, healthspan phase 1): monthly averages of
 * weight, waist, resting heart rate, HRV, sleep, steps, blood pressure and
 * VO2max over 6, 12 or 24 months (GET /healthspan/trends). A metric with
 * fewer than two months logged says so instead of drawing a line.
 */
export function HealthTrendsScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const [period, setPeriod] = useState<"6" | "12" | "24">("12");
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const q = useQuery({ queryKey: ["healthspan", "trends", period], queryFn: () => fetchLongTermTrends(Number(period)) });

  const metrics: Array<{ field: Field; title: string; unit: string; color: string; convert?: (v: number) => number }> = [
    { field: "weightKg", title: "Weight", unit: units.wtUnit, color: colors.accent, convert: (v) => Math.round(units.wt(v) * 10) / 10 },
    { field: "waistCm", title: "Waist", unit: units.lenUnit, color: colors.cyan, convert: (v) => Number(units.len(v)) },
    { field: "restingHr", title: "Resting heart rate", unit: "bpm", color: colors.danger },
    { field: "hrvMs", title: "HRV", unit: "ms", color: colors.aiAccent },
    { field: "sleepHours", title: "Sleep", unit: "h", color: colors.aiAccent },
    { field: "steps", title: "Steps per day", unit: "", color: colors.success },
    { field: "systolic", title: "Blood pressure (top number)", unit: "mmHg", color: colors.warning },
    { field: "vo2max", title: "VO₂max", unit: "mL/kg/min", color: colors.success },
  ];

  return (
    <ScreenContainer title="Long-term trends" subtitle="Monthly averages" onBack={() => navigation.goBack()}>
      <SegmentedControl
        options={[
          { value: "6", label: "6 months" },
          { value: "12", label: "1 year" },
          { value: "24", label: "2 years" },
        ]}
        value={period}
        onChange={setPeriod}
      />
      {q.isLoading ? (
        <SkeletonCard lines={4} />
      ) : q.isError || !q.data ? (
        <ErrorState message="Couldn't load your trends." onRetry={() => q.refetch()} />
      ) : (
        metrics.map((m) => {
          const pts = q.data.items
            .filter((r) => r[m.field] != null)
            .map((r) => ({ label: monthLabel(r.month), value: m.convert ? m.convert(r[m.field] as number) : (r[m.field] as number) }));
          const first = pts[0];
          const last = pts[pts.length - 1];
          const diastolic = m.field === "systolic" ? q.data.items.filter((r) => r.diastolic != null) : [];
          return (
            <Card key={m.field} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, flexShrink: 1 }}>{m.title}</Text>
                {last ? (
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>
                    {last.value.toLocaleString()}
                    <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>{m.unit ? ` ${m.unit}` : ""}</Text>
                  </Text>
                ) : null}
              </View>
              {pts.length >= 2 ? (
                <>
                  <LineChart data={pts} width={chartWidth} height={120} color={m.color} fromZero={false} accessibilityLabel={`${m.title} by month`} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {first.label}: {first.value.toLocaleString()} → {last.label}: {last.value.toLocaleString()}
                    {m.unit ? ` ${m.unit}` : ""}
                    {diastolic.length ? ` · bottom number now ${diastolic[diastolic.length - 1].diastolic}` : ""}
                  </Text>
                </>
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                  {pts.length === 1 ? `Only ${first.label} so far. A line shows from the second month.` : "Nothing logged in this period yet."}
                </Text>
              )}
            </Card>
          );
        })
      )}
    </ScreenContainer>
  );
}
