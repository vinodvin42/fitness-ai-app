import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { StreakCategory } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Icon, IconName } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { fetchStreaks } from "../../api/progress";
import { BRAND_NAME } from "../../lib/brand";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "StreakTracker">;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const CATEGORY_LABELS: Record<StreakCategory, string> = {
  training: "Training",
  nutrition: "Nutrition",
  hydration: "Hydration",
  mindfulness: "Mindfulness",
};
const CATEGORY_ORDER: StreakCategory[] = ["training", "nutrition", "hydration", "mindfulness"];
const CATEGORY_META: Record<StreakCategory, { icon: IconName; tint: string; tintSoft: string }> = {
  training: { icon: "dumbbell", tint: colors.accent, tintSoft: colors.accentSoft },
  nutrition: { icon: "utensils", tint: colors.success, tintSoft: colors.successSoft },
  hydration: { icon: "droplet", tint: colors.cyan, tintSoft: "rgba(34,211,238,0.16)" },
  mindfulness: { icon: "moon", tint: colors.aiAccent, tintSoft: "rgba(155,135,255,0.16)" },
};

function dayLabel(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

// Quiet green shading: more categories logged that day = a stronger tint. A
// day with nothing logged is simply a rest day (no red, no "missed" state).
function heatColor(level: number): string {
  if (level <= 0) return colors.surfaceRaised;
  if (level === 1) return "rgba(52,211,153,0.35)";
  if (level === 2) return "rgba(52,211,153,0.6)";
  return colors.success;
}

/**
 * Activity Calendar (Figma Progress 05; formerly Streak Tracker, docs/mobile/03-screen-inventory.md §F). The calendar and 20-week heatmap
 * are deliberately quiet (rest days are part of progress); streak counts stay available below. Original notes: "a 'fire' streak
 * banner, a grid heatmap (calendar-style), and a per-category streak list
 * (training, nutrition, mindfulness, hydration)." Shipped 19 Aug 2026,
 * backed by a new `GET /progress/streaks` (`progressService.getStreaks`)
 * that computes real current/longest streaks from WorkoutSession/MealLog/
 * WaterLog dates already logged — not a stored StreakRecord table, same
 * "computed, not stored" precedent as Personal Records. The "fire" banner
 * is a plain numeral + label (no icon library installed — see gap §29,
 * same substitution class as gaps §24/§25's ring/icon replacements), and
 * the heatmap shades each day's cell by accent-color opacity based on how
 * many of the four categories were active that day (0-4), rather than a
 * separate icon per category. "mindfulness" joined the other three
 * categories 22 Sep 2026, once a real `MindfulnessLog` (logged from the
 * Recovery screen's "Log Mindfulness Session" action) gave it a genuine
 * data source — see gap §29 for the full before/after.
 */
export function StreakTrackerScreen(_props: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["progress", "streaks"],
    queryFn: fetchStreaks,
  });

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const levelByDay = useMemo(() => {
    const map = new Map<number, number>();
    if (!data) return map;
    for (const cat of data.categories) {
      for (const dateStr of cat.activeDates) {
        const d = new Date(`${dateStr}T00:00:00Z`);
        if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
          const day = d.getUTCDate();
          map.set(day, (map.get(day) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [data, year, month]);

  if (isError) {
    return (
      <ScreenContainer title="Activity Calendar" eyebrow={BRAND_NAME}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !data) {
    return (
      <ScreenContainer title="Activity Calendar" eyebrow={BRAND_NAME}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const cells: Array<number | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const goToMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  // 20-week history (Monday-start columns, UTC dates like the API's activeDates).
  const levelByDate = new Map<string, number>();
  for (const cat of data.categories) for (const d of cat.activeDates) levelByDate.set(d, (levelByDate.get(d) ?? 0) + 1);
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const mondayThisWeek = new Date(todayUtc.getTime() - ((todayUtc.getUTCDay() + 6) % 7) * 86400000);
  const WEEKS = 20;
  const weekColumns = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(mondayThisWeek.getTime() - (WEEKS - 1 - w) * 7 * 86400000 + d * 86400000);
      return { key: date.toISOString().slice(0, 10), future: date.getTime() > todayUtc.getTime() };
    }),
  );
  const monthName = MONTH_NAMES[month];

  return (
    <ScreenContainer
      title="Activity Calendar"
      eyebrow={BRAND_NAME}
      subtitle="Rest days are part of progress. Logging is optional, and your history stays quiet."
    >
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Quiet activity calendar</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Pressable onPress={() => goToMonth(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous month">
              <Text style={{ color: colors.accent, ...typography.h2 }}>{"‹"}</Text>
            </Pressable>
            <Text style={{ color: colors.accent, ...typography.caption, backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              {monthName} {year}
            </Text>
            <Pressable onPress={() => goToMonth(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next month">
              <Text style={{ color: colors.accent, ...typography.h2 }}>{"›"}</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flexDirection: "row" }}>
          {WEEKDAY_LABELS.map((label, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((day, i) => {
            const level = day ? levelByDay.get(day) ?? 0 : 0;
            return (
              <View key={i} style={{ width: "14.28%", alignItems: "center", paddingVertical: 3 }}>
                {day ? (
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: heatColor(level),
                    }}
                  >
                    <Text style={{ color: level >= 3 ? "#04120E" : colors.textSecondary, ...typography.meta }}>{day}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Logged activity</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh }} />
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Rest day</Text>
          </View>
        </View>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Activity history</Text>
          <Text style={{ color: colors.textMuted, ...typography.caption }}>Honest, no pressure</Text>
        </View>
        <View
          style={{ flexDirection: "row", gap: 3 }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Activity history for the last ${WEEKS} weeks`}
        >
          {weekColumns.map((col, w) => (
            <View key={w} style={{ flex: 1, gap: 3 }}>
              {col.map((cell) => {
                const level = cell.future ? 0 : levelByDate.get(cell.key) ?? 0;
                return (
                  <View
                    key={cell.key}
                    style={{
                      aspectRatio: 1,
                      borderRadius: 3,
                      backgroundColor: cell.future ? "transparent" : heatColor(level),
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>Logged activity</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>Rest day</Text>
        </View>
      </Card>

      <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: radius.md,
            backgroundColor: "rgba(251,146,60,0.16)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="flame" size={32} color={colors.orange} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary }}>Current streak</Text>
          <Text style={{ color: colors.textPrimary, ...typography.metricLarge }}>
            {data.overall.currentStreak}{" "}
            <Text style={{ ...typography.h2, color: colors.textMuted }}>
              {data.overall.currentStreak === 1 ? "day" : "days"}
            </Text>
          </Text>
          <Text style={{ color: colors.textMuted, ...typography.caption }}>
            Longest: {dayLabel(data.overall.longestStreak)}
          </Text>
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Streaks by category</Text>
        {CATEGORY_ORDER.map((catKey) => {
          const cat = data.categories.find((c) => c.category === catKey);
          const meta = CATEGORY_META[catKey];
          return (
            <View
              key={catKey}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.sm,
                  backgroundColor: meta.tintSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={meta.icon} size={16} color={meta.tint} />
              </View>
              <Text style={{ color: colors.textPrimary, flex: 1 }}>{CATEGORY_LABELS[catKey]}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                {dayLabel(cat?.currentStreak ?? 0)} · best {dayLabel(cat?.longestStreak ?? 0)}
              </Text>
            </View>
          );
        })}
      </Card>
    </ScreenContainer>
  );
}
