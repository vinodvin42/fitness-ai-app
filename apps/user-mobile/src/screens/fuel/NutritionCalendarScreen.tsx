import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealLog } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchMealHistory } from "../../api/nutrition";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "NutritionCalendar">;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Same placeholder daily-calorie target as FuelScreen's DAILY_TARGETS.calories
// (no real per-user goal exists yet — gap §10) — kept as its own local
// constant here rather than a shared import, matching how WATER_GOAL_GLASSES
// is independently duplicated across FuelScreen/TodayScreen. Must be kept in
// sync with FuelScreen.tsx's DAILY_TARGETS.calories by hand until a real
// per-user goal system exists.
const DAILY_CALORIE_TARGET = 2000;

// "Compliance" isn't numerically defined anywhere in the design (see gap
// §28) — this pass's own reasonable reading: a day within ±20% of the
// placeholder target counts as "on track", meaningfully under or over
// otherwise, so the calendar has something real to badge each day with.
const ON_TRACK_MIN = 0.8;
const ON_TRACK_MAX = 1.2;

type Compliance = "onTrack" | "under" | "over" | "none";

function complianceFor(totalCalories: number): Compliance {
  if (totalCalories === 0) return "none";
  const ratio = totalCalories / DAILY_CALORIE_TARGET;
  if (ratio < ON_TRACK_MIN) return "under";
  if (ratio > ON_TRACK_MAX) return "over";
  return "onTrack";
}

function complianceColor(c: Compliance): string {
  if (c === "onTrack") return colors.success;
  if (c === "over") return colors.warning;
  if (c === "under") return colors.accent;
  return colors.border;
}

function complianceLabel(c: Compliance): string {
  if (c === "onTrack") return "On track";
  if (c === "over") return "Over target";
  if (c === "under") return "Under target";
  return "No log";
}

function complianceTone(c: Compliance): "success" | "warning" | "accent" | "neutral" {
  if (c === "onTrack") return "success";
  if (c === "over") return "warning";
  if (c === "under") return "accent";
  return "neutral";
}

function fmtDay(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * Nutrition Calendar (docs/mobile/03-screen-inventory.md §D): "a full month
 * grid (day cells colored/badged by compliance), selected-day detail stats,
 * a compliance card, and monthly summary stats." Shipped 19 Aug 2026, backed
 * by a new `GET /meal-logs` (every meal this user has ever logged, all-time
 * — `apps/api/src/modules/nutrition`'s `listMealHistory`) — the calendar
 * grid, per-day totals, and monthly stats are all computed here client-side
 * from that one list, same "fetch everything, group client-side" pattern as
 * Workout History and Timeline Month. "Compliance" itself has no numeric
 * definition anywhere in the design; see gap §28 for the ±20%-of-placeholder-
 * target reading used here, and for why this calendar doesn't factor in
 * hydration (Nutrition Dashboard's water tracker is a separate, already-
 * shipped feature with its own goal).
 */
// No navigation is used from Props — this screen is a leaf (no further
// drill-down beyond the day-detail card rendered inline) — but the standard
// NativeStackScreenProps<...> shape is kept for consistency with every
// other screen in this stack.
export function NutritionCalendarScreen(_props: Props) {
  const { data: history, isLoading, isError, refetch } = useQuery({
    queryKey: ["mealLogs", "history"],
    queryFn: fetchMealHistory,
  });

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const inSelectedMonth = useMemo(
    () =>
      (history ?? []).filter((log) => {
        const d = new Date(log.loggedAt);
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [history, year, month],
  );

  const byDay = useMemo(() => {
    const map = new Map<number, MealLog[]>();
    for (const log of inSelectedMonth) {
      const day = new Date(log.loggedAt).getDate();
      const existing = map.get(day) ?? [];
      existing.push(log);
      map.set(day, existing);
    }
    return map;
  }, [inSelectedMonth]);

  const complianceByDay = useMemo(() => {
    const map = new Map<number, Compliance>();
    for (const [day, logs] of byDay.entries()) {
      const totalCalories = logs.reduce((sum, l) => sum + l.calories, 0);
      map.set(day, complianceFor(totalCalories));
    }
    return map;
  }, [byDay]);

  const monthlyStats = useMemo(() => {
    const daysWithLogs = byDay.size;
    const onTrackDays = Array.from(complianceByDay.values()).filter((c) => c === "onTrack").length;
    const underDays = Array.from(complianceByDay.values()).filter((c) => c === "under").length;
    const overDays = Array.from(complianceByDay.values()).filter((c) => c === "over").length;
    const totalCalories = inSelectedMonth.reduce((sum, l) => sum + l.calories, 0);
    const avgCalories = daysWithLogs > 0 ? Math.round(totalCalories / daysWithLogs) : 0;
    return {
      daysWithLogs,
      onTrackDays,
      underDays,
      overDays,
      mealsLogged: inSelectedMonth.length,
      avgCalories,
    };
  }, [byDay, complianceByDay, inSelectedMonth]);

  const selectedDayLogs = selectedDay !== null ? byDay.get(selectedDay) ?? [] : [];
  const selectedDayTotals = selectedDayLogs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      proteinG: acc.proteinG + l.proteinG,
      carbsG: acc.carbsG + l.carbsG,
      fatG: acc.fatG + l.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  if (isError) {
    return (
      <ScreenContainer title="Nutrition Calendar">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (!isLoading && (history ?? []).length === 0) {
    return (
      <ScreenContainer title="Nutrition Calendar">
        <EmptyState title="No meals logged yet" subtitle="Log a meal from the Nutrition Dashboard to see it here." />
      </ScreenContainer>
    );
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: Array<number | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const goToMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDay(null);
  };

  return (
    <ScreenContainer title="Nutrition Calendar">
      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.xs }}>Compliance</Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
          {monthlyStats.onTrackDays} of {monthlyStats.daysWithLogs} logged days on track this month
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatTile label="On Track" value={String(monthlyStats.onTrackDays)} color={colors.success} />
          <StatTile label="Under" value={String(monthlyStats.underDays)} color={colors.accent} />
          <StatTile label="Over" value={String(monthlyStats.overDays)} color={colors.warning} />
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>This Month</Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatTile label="Days Logged" value={String(monthlyStats.daysWithLogs)} />
          <StatTile label="Meals Logged" value={String(monthlyStats.mealsLogged)} />
          <StatTile label="Avg kcal/day" value={String(monthlyStats.avgCalories)} />
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Pressable onPress={() => goToMonth(-1)}>
            <Text style={{ color: colors.accent, ...typography.h2 }}>{"‹"}</Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary }}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <Pressable onPress={() => goToMonth(1)}>
            <Text style={{ color: colors.accent, ...typography.h2 }}>{"›"}</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row" }}>
          {WEEKDAY_LABELS.map((label, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: spacing.xs }}>
          {cells.map((day, i) => {
            const compliance = day ? complianceByDay.get(day) ?? "none" : "none";
            return (
              <Pressable
                key={i}
                disabled={!day}
                onPress={() => day && setSelectedDay(day === selectedDay ? null : day)}
                style={{ width: "14.28%", alignItems: "center", paddingVertical: spacing.xs }}
              >
                {day ? (
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.sm,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: day === selectedDay ? colors.accent : "transparent",
                    }}
                  >
                    <Text style={{ color: day === selectedDay ? "#0B0B0F" : colors.textPrimary }}>{day}</Text>
                    {compliance !== "none" ? (
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 2.5,
                          marginTop: 2,
                          backgroundColor: day === selectedDay ? "#0B0B0F" : complianceColor(compliance),
                        }}
                      />
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {selectedDay !== null ? (
        <Card style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2, flex: 1 }}>{fmtDay(year, month, selectedDay)}</Text>
            <Pill
              label={complianceLabel(complianceByDay.get(selectedDay) ?? "none")}
              tone={complianceTone(complianceByDay.get(selectedDay) ?? "none")}
            />
          </View>
          {selectedDayLogs.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>No meals logged this day.</Text>
          ) : (
            <>
              <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
                {selectedDayTotals.calories} kcal · {selectedDayTotals.proteinG}g protein · {selectedDayTotals.carbsG}g carbs ·{" "}
                {selectedDayTotals.fatG}g fat
              </Text>
              {selectedDayLogs.map((log) => (
                <View key={log.id} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs }}>
                  <Text style={{ color: colors.textPrimary }}>{log.name}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>{log.calories} kcal</Text>
                </View>
              ))}
            </>
          )}
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: color ?? colors.accent, fontSize: 18, fontFamily: fonts.mono }}>{value}</Text>
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
    </View>
  );
}
