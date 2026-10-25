import React, { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { LineChart } from "../../components/Charts";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonCard } from "../../components/Skeleton";
import { SleepBars, SleepWindowChart, StageBar, StageLegend } from "../../components/RecoveryCharts";
import { fetchRecoveryTrends } from "../../api/recovery";
import {
  averageStages,
  bedMinutes,
  clockText,
  consistency,
  efficiencyPct,
  hm,
  inPeriod,
  lastNight,
  localYmd,
  sleepVsNeed,
  stagesOf,
  wakeMinutes,
} from "../../lib/sleepStats";
import { colors, fonts, layout, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, RecoverShell } from "./parts";
import { nightLabel } from "./RecoverySections";

type Props = NativeStackScreenProps<RecoverStackParamList, "Sleep">;
type Period = "7" | "30";

/** "Mon" for 7 nights, the day of the month every 5th night for 30. */
function axisLabel(date: string, index: number, period: Period): string {
  const d = new Date(`${date}T12:00:00`);
  if (period === "7") return d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2);
  return index % 5 === 0 ? String(d.getDate()) : "";
}

/**
 * Sleep (owner, 25 Oct 2026: "sleep duration vs sleep needed, awake, light,
 * deep and REM sleep, sleep efficiency, sleep consistency, sleep trends").
 * Everything comes from the member's own nights in GET /recovery/trends
 * (device-synced or self-logged); the maths and its rules are in
 * lib/sleepStats.ts. Sleep need is the general 8-hour adult target the
 * recovery score uses, said as such, not a personal measurement.
 */
export function SleepScreen({ navigation }: Props) {
  const [period, setPeriod] = useState<Period>("7");
  const days = Number(period);
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const trends = useQuery({ queryKey: ["recovery", "trends", 60], queryFn: () => fetchRecoveryTrends(60) });
  const today = localYmd();
  const all = trends.data?.items ?? [];
  const need = trends.data?.sleepNeedHours ?? 8;
  const nights = inPeriod(all, days, today).filter((d) => d.sleepHours != null);
  const vsNeed = sleepVsNeed(nights, need);
  const night = lastNight(all);
  const nightStages = night ? stagesOf(night) : null;
  const avgStages = averageStages(nights);
  const effs = nights.map((d) => ({ date: d.date, value: efficiencyPct(d) })).filter((p): p is { date: string; value: number } => p.value != null);
  const avgEff = effs.length ? Math.round(effs.reduce((s, p) => s + p.value, 0) / effs.length) : null;
  const cons = consistency(nights);
  const windows = nights.filter((d) => d.sleepStart && d.sleepEnd);
  const periodWord = period === "7" ? "7 nights" : "30 nights";

  return (
    <RecoverShell title="Sleep" subtitle="Your nights against your sleep need" onBack={() => navigation.goBack()}>
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
        <ErrorState message="Couldn't load your sleep." onRetry={() => trends.refetch()} />
      ) : nights.length === 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>No sleep logged in the last {periodWord}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            Connect a device that tracks sleep, or log when you went to bed and woke up.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton label="Log sleep" onPress={() => navigation.navigate("Recovery")} style={{ flex: 1 }} />
            <ActionButton label="Connect a device" onPress={() => navigation.navigate("ConnectedDevices")} variant="dark" style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <>
          {/* Duration vs need */}
          <Card style={{ gap: spacing.md }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Sleep vs need</Text>
            {vsNeed ? (
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <Stat label="Average asleep" value={hm(vsNeed.avgHours * 60)} />
                <Stat label="Need met" value={`${vsNeed.metNights} of ${vsNeed.nights}`} />
                <Stat label={period === "7" ? "Sleep debt" : "Short in total"} value={vsNeed.debtMin > 0 ? hm(vsNeed.debtMin) : "None"} />
              </View>
            ) : null}
            <SleepBars
              nights={nights.map((d, i) => ({ label: axisLabel(d.date, i, period), hours: d.sleepHours as number }))}
              needHours={need}
              width={chartWidth}
            />
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
              Sleep need is {need} hours, a general target for adults and the same one your recovery score uses. It isn't measured for
              you personally. Sleep debt adds up the time short of it on each night.
            </Text>
          </Card>

          {/* Stages */}
          <Card style={{ gap: spacing.md }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Sleep stages</Text>
            {nightStages && night ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{nightLabel(night.date, today)}</Text>
                <StageBar stages={nightStages} height={14} />
                <StageLegend stages={nightStages} />
              </View>
            ) : null}
            {avgStages ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                  Average over {avgStages.nights} night{avgStages.nights === 1 ? "" : "s"} with stages
                </Text>
                <StageBar stages={avgStages} height={14} />
                <StageLegend stages={avgStages} />
              </View>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                Awake, light, deep and REM sleep show when your watch or phone records sleep stages and shares them with Health Connect.
                A self-logged night has no stages.
              </Text>
            )}
          </Card>

          {/* Efficiency */}
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Sleep efficiency</Text>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>{avgEff != null ? `${avgEff}%` : "—"}</Text>
            </View>
            {effs.length >= 2 ? (
              <LineChart
                data={effs.map((p) => ({ label: new Date(`${p.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: p.value }))}
                width={chartWidth}
                height={130}
                color={colors.cyan}
                fromZero={false}
                accessibilityLabel="Sleep efficiency per night, percent"
              />
            ) : null}
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
              {avgEff != null
                ? `Time asleep as a share of time in bed, averaged over ${effs.length} night${effs.length === 1 ? "" : "s"}.`
                : "Time asleep as a share of time in bed. It needs bed and wake times plus awake time, from a device that records stages, or hours slept typed in with your bed and wake times."}
            </Text>
          </Card>

          {/* Consistency */}
          <Card style={{ gap: spacing.md }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Sleep consistency</Text>
            {cons ? (
              <>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{cons.label}</Text>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Stat label="Usual bedtime" value={clockText(cons.avgBedMin + 720)} sub={`±${cons.bedtimeSpreadMin} min`} />
                  <Stat label="Usual wake time" value={clockText(cons.avgWakeMin)} sub={`±${cons.wakeSpreadMin} min`} />
                </View>
              </>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                Needs bed and wake times for at least 3 nights.
              </Text>
            )}
            {windows.length > 0 ? (
              <SleepWindowChart
                nights={windows.map((d, i) => ({
                  label: axisLabel(d.date, i, period),
                  bedMin: bedMinutes(d.sleepStart as string),
                  wakeMin: wakeMinutes(d.sleepEnd as string),
                }))}
                width={chartWidth}
              />
            ) : null}
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
              How much your bedtime and wake time move from night to night, over your latest 7 nights. Within 30 minutes is very
              consistent; over an hour is irregular.
            </Text>
          </Card>
        </>
      )}
    </RecoverShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 17 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{sub}</Text> : null}
    </View>
  );
}
