import React from "react";
import { Pressable, Text, View } from "react-native";
import type { RecoveryTrendDay } from "@fitness-ai-app/types";
import { Card } from "../../components/Card";
import { Icon, type IconName } from "../../components/Icon";
import { Sparkline, StageBar, StageLegend } from "../../components/RecoveryCharts";
import {
  bedMinutes,
  clockText,
  consistency,
  daysBetween,
  efficiencyPct,
  hm,
  lastNight,
  periodStat,
  series,
  stagesOf,
  stressWord,
  wakeMinutes,
  type PeriodStat,
} from "../../lib/sleepStats";
import { colors, fonts, radius, spacing, themed, typography } from "../../theme/tokens";
import { ProgressBar } from "./parts";

/**
 * Recovery's sleep and trend summaries (owner, 25 Oct 2026). Shown on the
 * Recovery tab; each opens its full screen (SleepScreen, RecoveryTrendsScreen).
 * Built only from GET /recovery/trends rows (lib/sleepStats.ts).
 */

export function nightLabel(date: string, today: string): string {
  const ago = daysBetween(date, today);
  if (ago <= 0) return "Last night";
  if (ago === 1) return "Night before last";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Last night against the sleep need, its stages, efficiency, bed/wake times and this week's consistency. */
export function SleepSummaryCard({
  items,
  needHours,
  today,
  onOpen,
  onLog,
}: {
  items: RecoveryTrendDay[];
  needHours: number;
  today: string;
  onOpen: () => void;
  onLog: () => void;
}) {
  const night = lastNight(items);
  const recent = night && daysBetween(night.date, today) <= 7 ? night : null;
  if (!recent || recent.sleepHours == null) {
    return (
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Sleep</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          No sleep logged this week. Connect a device, or log when you went to bed and woke up, to see sleep against your need,
          your sleep stages, efficiency and consistency.
        </Text>
        <Pressable onPress={onLog} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "flex-start" }}>
          <Text style={{ color: colors.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Log sleep ›</Text>
        </Pressable>
      </Card>
    );
  }
  const asleepMin = recent.sleepHours * 60;
  const shortMin = Math.round(needHours * 60 - asleepMin);
  const stages = stagesOf(recent);
  const eff = efficiencyPct(recent);
  const cons = consistency(items);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Sleep, ${hm(asleepMin)} of a ${needHours}-hour need. Open sleep details`}>
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Icon name="moon" size={18} color={colors.aiAccent} />
          <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Sleep</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{nightLabel(recent.date, today)}</Text>
          <Icon name="chevron-right" size={16} color={colors.textSecondary} />
        </View>

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 26 }}>{hm(asleepMin)}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>of {needHours}h need</Text>
          </View>
          <ProgressBar progress={asleepMin / (needHours * 60)} height={6} />
          <Text style={{ color: shortMin <= 0 ? colors.successText : colors.textSecondary, fontSize: 13 }}>
            {shortMin <= 0 ? "Sleep need met" : `${hm(shortMin)} short of your need`}
          </Text>
        </View>

        {stages ? (
          <View style={{ gap: spacing.sm }}>
            <StageBar stages={stages} />
            <StageLegend stages={stages} />
          </View>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            Awake, light, deep and REM show when your watch or phone records sleep stages.
          </Text>
        )}

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <MiniStat label="Efficiency" value={eff != null ? `${eff}%` : "—"} />
          <MiniStat label="Bedtime" value={recent.sleepStart ? clockText(bedMinutes(recent.sleepStart) + 720) : "—"} />
          <MiniStat label="Woke" value={recent.sleepEnd ? clockText(wakeMinutes(recent.sleepEnd)) : "—"} />
        </View>

        {cons ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi }}>{cons.label}</Text> · bedtime varies ±{cons.bedtimeSpreadMin} min over{" "}
            {cons.nights} nights
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, gap: 2 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export interface TrendMetric {
  key: "recovery" | "sleep" | "hrv" | "rhr" | "stress";
  label: string;
  icon: IconName;
  color: string;
  pick: (d: RecoveryTrendDay) => number | null;
  format: (avg: number) => string;
}

export const TREND_METRICS: TrendMetric[] = themed(() => [
  { key: "recovery", label: "Recovery score", icon: "heart-pulse", color: colors.accent, pick: (d) => d.recoveryScore, format: (v) => `${Math.round(v)}/100` },
  { key: "sleep", label: "Sleep", icon: "moon", color: colors.aiAccent, pick: (d) => d.sleepHours, format: (v) => hm(v * 60) },
  { key: "hrv", label: "HRV", icon: "activity", color: colors.cyan, pick: (d) => d.hrvMs, format: (v) => `${Math.round(v)} ms` },
  { key: "rhr", label: "Resting heart rate", icon: "heart", color: colors.danger, pick: (d) => d.restingHeartRate, format: (v) => `${Math.round(v)} bpm` },
  { key: "stress", label: "Stress", icon: "brain", color: colors.warning, pick: (d) => d.stressScore, format: (v) => `${Math.round(v)} · ${stressWord(v)}` },
]);

/** "▲ 4% vs last week" (null when there's nothing to compare with). */
export function changeText(stat: PeriodStat | null, periodWord: string): string | null {
  if (!stat || stat.changePct == null) return null;
  if (stat.changePct === 0) return `Same as last ${periodWord}`;
  return `${stat.changePct > 0 ? "▲" : "▼"} ${Math.abs(stat.changePct)}% vs last ${periodWord}`;
}

/** Last 7 days of recovery score, sleep, HRV, resting HR and stress, each against the week before. */
export function TrendsCard({ items, today, onOpen }: { items: RecoveryTrendDay[]; today: string; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Recovery trends, last 7 days. Open trends">
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Icon name="trending-up" size={18} color={colors.accentText} />
          <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Trends</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Last 7 days</Text>
          <Icon name="chevron-right" size={16} color={colors.textSecondary} />
        </View>
        {TREND_METRICS.map((m) => {
          const stat = periodStat(items, m.pick, 7, today);
          const change = changeText(stat, "week");
          return (
            <View key={m.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Icon name={m.icon} size={16} color={m.color} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{m.label}</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>
                  {stat ? m.format(stat.avg) : "—"}
                  {stat ? <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}> avg</Text> : null}
                </Text>
                {change ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>{change}</Text> : null}
              </View>
              <Sparkline values={series(items, m.pick, 7, today).map((p) => p.value)} color={m.color} />
            </View>
          );
        })}
      </Card>
    </Pressable>
  );
}
