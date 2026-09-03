import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Pill } from "../../components/Pill";
import { SearchBar } from "../../components/SearchBar";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchWorkoutHistory } from "../../api/workoutSessions";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "WorkoutHistory">;

const ALL = "All";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Workout History (trn-11) — docs/mobile/03-screen-inventory.md §C:
 * "search, filters, a monthly stats summary, a calendar heatmap, and a
 * chronological history list, with a 'compare' action." Shipped 19 Aug
 * 2026, backed by a new `GET /workout-sessions` (real per-session totals —
 * duration, set count, volume — computed server-side, not re-derived here).
 * The calendar reuses Timeline Month's grid pattern (a dot on any day with
 * a session); tapping a day narrows the list below to that day, combining
 * with search/status/program filters rather than replacing them. "Compare"
 * is this pass's own reasonable interpretation, since the design doesn't
 * specify what it compares: select exactly two sessions and see their
 * duration/sets/volume side by side — a real, useful reading of the
 * feature name, not a guess at unrelated functionality.
 */
export function WorkoutHistoryScreen({ navigation }: Props) {
  const { data: history, isLoading, isError, refetch } = useQuery({
    queryKey: ["workoutHistory"],
    queryFn: fetchWorkoutHistory,
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [programFilter, setProgramFilter] = useState(ALL);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  const statuses = useMemo(() => [ALL, ...Array.from(new Set((history ?? []).map((h) => h.status)))], [history]);
  const programs = useMemo(() => [ALL, ...Array.from(new Set((history ?? []).map((h) => h.programName)))], [history]);

  const inSelectedMonth = useMemo(
    () =>
      (history ?? []).filter((h) => {
        const d = new Date(h.startedAt);
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [history, year, month],
  );

  const dayHasSession = useMemo(() => {
    const set = new Set<number>();
    for (const h of inSelectedMonth) set.add(new Date(h.startedAt).getDate());
    return set;
  }, [inSelectedMonth]);

  const monthlyStats = useMemo(() => {
    const completed = inSelectedMonth.filter((h) => h.status === "completed");
    return {
      sessions: inSelectedMonth.length,
      totalSets: inSelectedMonth.reduce((sum, h) => sum + h.totalSets, 0),
      totalVolumeKg: Math.round(inSelectedMonth.reduce((sum, h) => sum + h.totalVolumeKg, 0)),
      completed: completed.length,
    };
  }, [inSelectedMonth]);

  const filtered = useMemo(() => {
    return (history ?? []).filter((h) => {
      const matchesQuery = h.workoutName.toLowerCase().includes(query.trim().toLowerCase());
      const matchesStatus = statusFilter === ALL || h.status === statusFilter;
      const matchesProgram = programFilter === ALL || h.programName === programFilter;
      const matchesDay =
        selectedDay === null ||
        (() => {
          const d = new Date(h.startedAt);
          return d.getFullYear() === year && d.getMonth() === month && d.getDate() === selectedDay;
        })();
      return matchesQuery && matchesStatus && matchesProgram && matchesDay;
    });
  }, [history, query, statusFilter, programFilter, selectedDay, year, month]);

  if (isError) {
    return (
      <ScreenContainer title="Workout History">
        <ErrorState onRetry={() => refetch()} />
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

  const toggleCompareSelection = (id: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const compareEntries = (history ?? []).filter((h) => selectedForCompare.includes(h.id));

  return (
    <ScreenContainer title="Workout History">
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search workouts" />

      {statuses.length > 2 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
          {statuses.map((s) => (
            <Chip key={s} label={s === "in_progress" ? "In Progress" : s} selected={statusFilter === s} onPress={() => setStatusFilter(s)} />
          ))}
        </View>
      ) : null}

      {programs.length > 2 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
          {programs.map((p) => (
            <Chip key={p} label={p} selected={programFilter === p} onPress={() => setProgramFilter(p)} />
          ))}
        </View>
      ) : null}

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.xs }}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatTile label="Sessions" value={String(monthlyStats.sessions)} />
          <StatTile label="Completed" value={String(monthlyStats.completed)} />
          <StatTile label="Sets" value={String(monthlyStats.totalSets)} />
          <StatTile label="Volume" value={`${monthlyStats.totalVolumeKg}kg`} />
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Pressable onPress={() => goToMonth(-1)}>
            <Text style={{ color: colors.accent, ...typography.h2 }}>{"‹"}</Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary }}>Calendar</Text>
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
          {cells.map((day, i) => (
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
                  {dayHasSession.has(day) ? (
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 2.5,
                        marginTop: 2,
                        backgroundColor: day === selectedDay ? "#0B0B0F" : colors.accent,
                      }}
                    />
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg }}>
        <Text style={{ color: colors.textSecondary }}>
          History{selectedDay ? ` — ${MONTH_NAMES[month]} ${selectedDay}` : ""}
        </Text>
        <Button
          label={compareMode ? "Cancel Compare" : "Compare"}
          variant="secondary"
          onPress={() => {
            setCompareMode((v) => !v);
            setSelectedForCompare([]);
          }}
          style={{ height: 36, paddingHorizontal: spacing.md }}
        />
      </View>

      {compareMode && compareEntries.length === 2 ? (
        <Card style={{ marginTop: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Comparison</Text>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            {compareEntries.map((e) => (
              <View key={e.id} style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, ...typography.body, fontFamily: fonts.bodySemi }}>{e.workoutName}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>{fmtDate(e.startedAt)}</Text>
                <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                  {e.durationMinutes !== null ? `${e.durationMinutes} min` : "In progress"}
                </Text>
                <Text style={{ color: colors.textSecondary }}>{e.totalSets} sets</Text>
                <Text style={{ color: colors.textSecondary }}>{Math.round(e.totalVolumeKg)}kg volume</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        {filtered.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() =>
              compareMode
                ? toggleCompareSelection(entry.id)
                : navigation.navigate("WorkoutDetail", { workoutId: entry.workoutId })
            }
          >
            <Card
              style={
                compareMode && selectedForCompare.includes(entry.id)
                  ? { borderColor: colors.accent, borderWidth: 2 }
                  : undefined
              }
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{entry.workoutName}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>
                    {entry.programName} · {fmtDate(entry.startedAt)}
                  </Text>
                  <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                    {entry.durationMinutes !== null ? `${entry.durationMinutes} min · ` : ""}
                    {entry.totalSets} sets · {Math.round(entry.totalVolumeKg)}kg
                  </Text>
                </View>
                <Pill
                  label={entry.status === "in_progress" ? "In Progress" : entry.status}
                  tone={entry.status === "completed" ? "success" : entry.status === "in_progress" ? "warning" : "neutral"}
                />
              </View>
            </Card>
          </Pressable>
        ))}
        {!isLoading && filtered.length === 0 ? (
          <EmptyState title="No workouts match" subtitle="Try a different search, filter, or day." />
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
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
      <Text style={{ color: colors.accent, fontSize: 18, fontFamily: fonts.mono }}>{value}</Text>
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
    </View>
  );
}
