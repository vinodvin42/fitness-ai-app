import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ActivityLog, WorkoutHistoryEntry } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { BackButton } from "../../components/BackButton";
import { fetchWorkoutHistory } from "../../api/workoutSessions";
import { fetchActivities } from "../../api/activities";
import { fetchPrograms } from "../../api/programs";
import { kgToDisplay, useWorkoutSettings } from "../../api/workoutSettings";
import { formatKm } from "../../lib/activityFormat";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "WorkoutHistory">;

type Category = "all" | "strength" | "cardio" | "yoga" | "classes";
const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: "all", label: "All" },
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "yoga", label: "Yoga" },
  { value: "classes", label: "Classes" },
];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Monday-first, matching the Figma heatmap (M T W T F S S).
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

interface Item {
  id: string;
  category: "strength" | "cardio";
  title: string;
  startedAt: string;
  durationMinutes: number | null;
  detail: string;
  completed: boolean;
  statusLabel: string;
  entry?: WorkoutHistoryEntry;
  activity?: ActivityLog;
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Workout History (Figma Train 11 + empty state 17). Strength = workout
 * sessions (GET /workout-sessions); Cardio = tracked/manual runs and rides
 * (GET /activities). Yoga and Classes chips are kept for the design, but this
 * app does not record those session types yet, so they show an honest empty
 * state. Monthly consistency = completed sessions that month / sessions
 * planned on the user's training days up to today (from Preferences), shown as
 * a dash when no training days are set.
 */
export function WorkoutHistoryScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const { data: settings } = useWorkoutSettings();
  const unit = settings?.weightUnit ?? "kg";
  const sessionsQuery = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory });
  const activitiesQuery = useQuery({ queryKey: ["activities", "list", "all"], queryFn: () => fetchActivities() });
  const programsQuery = useQuery({ queryKey: ["programs"], queryFn: fetchPrograms });

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const isLoading = sessionsQuery.isLoading || activitiesQuery.isLoading;
  const isError = sessionsQuery.isError;

  const items = useMemo<Item[]>(() => {
    const sessions: Item[] = (sessionsQuery.data ?? []).map((h) => ({
      id: h.id,
      category: "strength",
      title: h.workoutName,
      startedAt: h.startedAt,
      durationMinutes: h.durationMinutes,
      detail: `${h.totalSets} ${h.totalSets === 1 ? "set" : "sets"} · ${Math.round(kgToDisplay(h.totalVolumeKg, unit)).toLocaleString()} ${unit}`,
      completed: h.status === "completed",
      statusLabel: h.status === "completed" ? "Completed" : h.status === "in_progress" ? "In progress" : "Abandoned",
      entry: h,
    }));
    const cardio: Item[] = (activitiesQuery.data ?? []).map((a) => ({
      id: `act-${a.id}`,
      category: "cardio",
      title: a.kind === "run" ? "Outdoor Run" : "Outdoor Cycle",
      startedAt: a.startedAt,
      durationMinutes: Math.round(a.durationSeconds / 60),
      detail: formatKm(a.distanceMeters),
      completed: true,
      statusLabel: "Completed",
      activity: a,
    }));
    return [...sessions, ...cardio].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [sessionsQuery.data, activitiesQuery.data, unit]);

  const inMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === year && d.getMonth() === month;
  };

  const monthItems = useMemo(() => items.filter((i) => inMonth(i.startedAt)), [items, year, month]);
  const activeDays = useMemo(() => {
    const set = new Set<number>();
    for (const i of monthItems) if (i.completed) set.add(new Date(i.startedAt).getDate());
    return set;
  }, [monthItems]);

  const stats = useMemo(() => {
    const completed = monthItems.filter((i) => i.completed);
    const volumeKg = completed.reduce((s, i) => s + (i.entry?.totalVolumeKg ?? 0), 0);
    const planDays = settings?.trainingDays ?? [];
    let planned = 0;
    if (planDays.length > 0) {
      const lastDay = year === now.getFullYear() && month === now.getMonth() ? now.getDate() : new Date(year, month + 1, 0).getDate();
      for (let d = 1; d <= lastDay; d++) if (planDays.includes(DAY_KEYS[new Date(year, month, d).getDay()])) planned += 1;
    }
    return {
      workouts: completed.length,
      volumeKg,
      consistency: planned > 0 ? Math.min(100, Math.round((completed.length / planned) * 100)) : null,
    };
  }, [monthItems, settings?.trainingDays, year, month]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (category === "yoga" || category === "classes") return false;
      if (category !== "all" && i.category !== category) return false;
      if (q && !i.title.toLowerCase().includes(q)) return false;
      if (selectedDay !== null) {
        const d = new Date(i.startedAt);
        if (!(d.getFullYear() === year && d.getMonth() === month && d.getDate() === selectedDay)) return false;
      }
      return true;
    });
  }, [items, query, category, selectedDay, year, month]);

  if (isError) {
    return (
      <ScreenContainer title="Workout History">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => sessionsQuery.refetch()} />
      </ScreenContainer>
    );
  }

  // Train 17: nothing logged at all (strength or cardio).
  if (!isLoading && items.length === 0) {
    const starter = (programsQuery.data ?? []).find((p) => p.priceCents === 0 && p.level === "beginner") ?? (programsQuery.data ?? []).find((p) => p.priceCents === 0);
    return (
      <ScreenContainer title="Workout History" subtitle="Your completed sessions, all in one place">
        <BackButton onPress={() => navigation.goBack()} />
        <View style={{ alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.sm }}>
          <View
            style={{ width: 84, height: 84, borderRadius: radius.lg, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="dumbbell" size={36} color={theme.textOnAccent} />
          </View>
          <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22, textAlign: "center" }}>Your first workout starts here</Text>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14, lineHeight: 21, textAlign: "center" }}>
            You haven't logged a workout yet. After your first session, you'll see its exercises, duration and notes here.
          </Text>
          <Button label="Find your first workout" onPress={() => navigation.navigate("ProgramsMarketplace")} style={{ alignSelf: "stretch" }} />
          <Pressable onPress={() => navigation.navigate("Routines")} accessibilityRole="button" hitSlop={8}>
            <Text style={{ color: theme.accent, ...typography.label }}>Already trained? Log a workout</Text>
          </Pressable>
        </View>
        {starter ? (
          <Card style={{ gap: spacing.xs }}>
            <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6 }}>A SIMPLE PLACE TO START</Text>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{starter.name}</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {starter.durationWeeks} week{starter.durationWeeks === 1 ? "" : "s"}
              {starter.level ? ` · ${starter.level[0].toUpperCase()}${starter.level.slice(1)}` : ""} · Free
            </Text>
            <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13 }} numberOfLines={3}>
              {starter.description}
            </Text>
            <Pressable onPress={() => navigation.navigate("ProgramDetail", { programId: starter.id })} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: theme.accent, ...typography.label }}>View program →</Text>
            </Pressable>
          </Card>
        ) : null}
        <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
          Start at your own pace. Every session can be adjusted.
        </Text>
      </ScreenContainer>
    );
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const goToMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDay(null);
  };
  const toggleCompareSelection = (id: string) =>
    setSelectedForCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id]));
  const compareEntries = items.filter((i) => i.entry && selectedForCompare.includes(i.id));

  const strengthMonth = monthItems.filter((i) => i.entry && i.completed);

  return (
    <ScreenContainer
      title="Workout History"
      right={
        <Pressable
          onPress={() => {
            setCompareMode((v) => !v);
            setSelectedForCompare([]);
          }}
          accessibilityRole="button"
          style={{
            borderWidth: 1,
            borderColor: theme.accent,
            backgroundColor: theme.accentSoft,
            borderRadius: radius.sm,
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        >
          <Text numberOfLines={1} style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 10 }}>
            {compareMode ? "Cancel Compare" : "Compare Side by Side"}
          </Text>
        </Pressable>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search historic workouts..." />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {CATEGORIES.map((c) => {
          const on = c.value === category;
          return (
            <Pressable
              key={c.value}
              onPress={() => setCategory(c.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 7,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: on ? theme.accent : colors.border,
                backgroundColor: on ? theme.accentSoft : colors.surface,
              }}
            >
              <Text style={{ color: on ? theme.accent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ flexDirection: "row", paddingVertical: spacing.md }}>
        <Stat label="WORKOUTS" value={String(stats.workouts)} />
        <Stat label="TOTAL VOLUME" value={`${Math.round(kgToDisplay(stats.volumeKg, unit)).toLocaleString()} ${unit}`} />
        <Stat label="CONSISTENCY" value={stats.consistency === null ? "-" : `${stats.consistency}%`} tint={stats.consistency === null ? undefined : colors.success} />
      </Card>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Pressable onPress={() => goToMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={8}>
            <Icon name="chevron-left" size={16} color={colors.textSecondary} />
          </Pressable>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
            Monthly Consistency ({MONTH_NAMES[month].slice(0, 3)}
            {year === now.getFullYear() ? "" : ` ${year}`})
          </Text>
          <Pressable onPress={() => goToMonth(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={8}>
            <Icon name="chevron-right" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Text numberOfLines={1} style={{ color: colors.textMuted, ...typography.meta, flexShrink: 0 }}>
          {activeDays.size} Active {activeDays.size === 1 ? "Day" : "Days"}
        </Text>
      </View>
      <Card style={{ gap: 6, paddingVertical: spacing.md - 4 }}>
        <View style={{ flexDirection: "row" }}>
          {WEEKDAY_LABELS.map((label, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
            </View>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={{ flexDirection: "row" }}>
            {cells.slice(row * 7, row * 7 + 7).map((day, i) => {
              const active = day !== null && activeDays.has(day);
              const selected = day !== null && day === selectedDay;
              return (
                <View key={i} style={{ flex: 1, alignItems: "center" }}>
                  {day === null ? (
                    <View style={{ width: 34, height: 34 }} />
                  ) : (
                    <Pressable
                      onPress={() => setSelectedDay(selected ? null : day)}
                      accessibilityRole="button"
                      accessibilityLabel={`${MONTH_NAMES[month]} ${day}${active ? ", workout logged" : ""}`}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: radius.sm,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: active ? theme.accent : colors.surfaceHigh,
                        borderWidth: selected ? 2 : 0,
                        borderColor: colors.textPrimary,
                      }}
                    >
                      <Text style={{ color: active ? theme.textOnAccent : colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 10 }}>{day}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </Card>

      {compareMode ? (
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>Select two strength sessions to compare.</Text>
      ) : null}
      {compareMode && compareEntries.length === 2 ? (
        <Card>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Comparison</Text>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            {compareEntries.map((e) => (
              <View key={e.id} style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi }}>{e.title}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>{new Date(e.startedAt).toLocaleDateString()}</Text>
                <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                  {e.durationMinutes !== null ? `${e.durationMinutes} min` : "In progress"}
                </Text>
                <Text style={{ color: colors.textSecondary }}>{e.detail}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
        Recent Workouts{selectedDay ? ` - ${MONTH_NAMES[month]} ${selectedDay}` : ""}
      </Text>
      <View style={{ gap: spacing.sm }}>
        {filtered.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => {
              if (compareMode) {
                if (item.entry) toggleCompareSelection(item.id);
              } else if (item.entry) {
                navigation.navigate("SessionSets", { sessionId: item.id, workoutId: item.entry.workoutId, workoutName: item.title });
              } else if (item.activity) {
                navigation.navigate("ActivityDetail", { activityId: item.activity.id });
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.statusLabel}`}
          >
            <Card
              style={[
                { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md - 2 },
                compareMode && selectedForCompare.includes(item.id) ? { borderColor: theme.accent, borderWidth: 2 } : {},
              ]}
            >
              <Icon name={item.category === "cardio" ? "footprints" : "dumbbell"} size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>{item.title}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  {whenLabel(item.startedAt)}
                  {item.durationMinutes !== null ? ` · ${item.durationMinutes} min` : ""} · {item.detail}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: item.completed ? colors.successSoft : colors.warningSoft,
                  borderRadius: radius.xs,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: item.completed ? colors.success : colors.warning, fontFamily: fonts.bodySemi, fontSize: 10 }}>
                  {item.statusLabel}
                </Text>
              </View>
            </Card>
          </Pressable>
        ))}
        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            title={category === "yoga" || category === "classes" ? `No ${category} sessions` : "No workouts match"}
            subtitle={
              category === "yoga" || category === "classes"
                ? `${category === "yoga" ? "Yoga" : "Class"} sessions are not recorded in this app yet. Your strength sessions and tracked runs and rides are listed under All.`
                : "Try a different search, filter, or day."
            }
          />
        ) : null}
      </View>

      {stats.workouts > 0 && strengthMonth.length > 0 ? (
        <Card style={{ borderColor: colors.warning, backgroundColor: colors.warningSoft, gap: spacing.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="sparkles" size={13} color={colors.warning} />
            <Text style={{ color: colors.warning, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6 }}>23PRIMEFIT RECOMMENDATION</Text>
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
            {stats.consistency !== null && stats.consistency < 70
              ? `You have completed ${stats.workouts} of your planned sessions this month (${stats.consistency}%). Shorter sessions on your training days can help you stay on track.`
              : `You have completed ${stats.workouts} session${stats.workouts === 1 ? "" : "s"} this month. See your muscle-group balance in Training Analytics.`}
          </Text>
          <Pressable
            onPress={() => navigation.navigate("TrainingAnalytics")}
            accessibilityRole="button"
            style={{ alignSelf: "flex-start", backgroundColor: colors.surfaceHigh, borderRadius: radius.xs, paddingHorizontal: 10, paddingVertical: 5 }}
          >
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 12 }}>View Analytics</Text>
          </Pressable>
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.xs }}>
      <Text style={{ color: colors.textMuted, ...typography.caption, letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ color: tint ?? colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}
