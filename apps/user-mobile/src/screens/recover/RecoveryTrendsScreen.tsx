import React, { useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { LineChart } from "../../components/Charts";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchRecoveryTrends } from "../../api/recovery";
import { localYmd, periodStat, series } from "../../lib/sleepStats";
import { colors, fonts, layout, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { RecoverShell } from "./parts";
import { changeText, TREND_METRICS, type TrendMetric } from "./RecoverySections";

type Props = NativeStackScreenProps<RecoverStackParamList, "RecoveryTrends">;
type Period = "7" | "30";

/** What each trend is, in plain words; no claims beyond what the number is. */
const ABOUT: Record<TrendMetric["key"], string> = {
  recovery: "Your daily recovery score: sleep, HRV, resting heart rate, energy and soreness against your own recent days.",
  sleep: "Hours asleep each night.",
  hrv: "Heart-rate variability from your device or log. Compare it with your own average; it moves from day to day.",
  rhr: "Your lowest steady heart rate of the day, from your device or log.",
  stress: "A 0–100 score from a connected device that reports stress (higher is more stressed).",
};

const EMPTY: Record<TrendMetric["key"], string> = {
  recovery: "A score needs at least three of sleep, HRV, resting heart rate, energy and soreness on a day.",
  sleep: "No sleep logged in this period.",
  hrv: "No HRV in this period. It comes from a device that measures it, or your own log.",
  rhr: "No resting heart rate in this period.",
  stress: "No stress data. It shows when a connected device reports a stress score; Health Connect doesn't share one.",
};

/**
 * Recovery trends (owner, 25 Oct 2026: "sleep trends, HRV, resting heart
 * rate, stress, recovery trends"): each metric's average over the last 7 or
 * 30 days, the change against the period before, and a day-by-day line.
 * Built from GET /recovery/trends (lib/sleepStats.ts).
 */
export function RecoveryTrendsScreen({ navigation }: Props) {
  const [period, setPeriod] = useState<Period>("7");
  const days = Number(period);
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const trends = useQuery({ queryKey: ["recovery", "trends", 60], queryFn: () => fetchRecoveryTrends(60) });
  const today = localYmd();
  const items = trends.data?.items ?? [];
  const periodWord = period === "7" ? "week" : "30 days";

  return (
    <RecoverShell title="Recovery trends" subtitle={`Last ${days} days against the ${days} before`} onBack={() => navigation.goBack()}>
      <SegmentedControl
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
        ]}
        value={period}
        onChange={setPeriod}
      />
      {trends.isLoading ? (
        <SkeletonCard lines={4} />
      ) : trends.isError ? (
        <ErrorState message="Couldn't load your trends." onRetry={() => trends.refetch()} />
      ) : (
        TREND_METRICS.map((m) => {
          const stat = periodStat(items, m.pick, days, today);
          const points = series(items, m.pick, days, today);
          const change = changeText(stat, periodWord);
          return (
            <Card key={m.key} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Icon name={m.icon} size={18} color={m.color} />
                <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>{m.label}</Text>
                {m.key === "sleep" ? (
                  <Pressable onPress={() => navigation.navigate("Sleep")} accessibilityRole="button" hitSlop={8}>
                    <Text style={{ color: colors.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Sleep details ›</Text>
                  </Pressable>
                ) : null}
              </View>
              {stat ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexWrap: "wrap" }}>
                    <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 24 }}>{m.format(stat.avg)}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      average over {stat.n} day{stat.n === 1 ? "" : "s"}
                    </Text>
                  </View>
                  {change ? <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{change}</Text> : null}
                  {points.length >= 2 ? (
                    <LineChart
                      data={points.map((p) => ({
                        label: new Date(`${p.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
                        value: m.key === "sleep" ? Math.round(p.value * 10) / 10 : Math.round(p.value),
                      }))}
                      width={chartWidth}
                      height={130}
                      color={m.color}
                      fromZero={false}
                      accessibilityLabel={`${m.label} per day`}
                    />
                  ) : null}
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>{ABOUT[m.key]}</Text>
                </>
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{EMPTY[m.key]}</Text>
              )}
            </Card>
          );
        })
      )}
    </RecoverShell>
  );
}
