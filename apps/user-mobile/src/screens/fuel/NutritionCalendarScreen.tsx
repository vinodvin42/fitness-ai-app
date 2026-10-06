import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealType, NutritionDaySummary, UpdateMealLogInput } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { BottomSheet } from "../../components/BottomSheet";
import { TextField } from "../../components/TextField";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { deleteMealLog, fetchNutritionCalendar, fetchNutritionSummary, updateMealLog } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "NutritionCalendar">;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Same placeholder daily-calorie target as FuelScreen's DAILY_TARGETS.calories
// (no real per-user goal exists yet — gap §10). Keep in sync by hand until a
// real per-user goal system exists.
const DAILY_CALORIE_TARGET = 2000;

// "Compliance" isn't numerically defined anywhere in the design (see gap
// §28) — this pass's own reading: a day within ±20% of the placeholder target
// counts as "on track", meaningfully under or over otherwise.
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

type DayMeal = NutritionDaySummary["meals"][number];

const MEAL_TYPES: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

/**
 * Nutrition Calendar (docs/mobile/03-screen-inventory.md §D): a month grid
 * (day cells badged by compliance), selected-day stats, a compliance card and
 * monthly summary stats. Wave B (Oct 2026): backed by the server-side
 * `GET /nutrition/calendar?month=` (per-day calories) and
 * `GET /nutrition/summary?date=` (totals + meals for the selected day) instead
 * of downloading the whole meal history, and meals can now be edited or
 * deleted from a bottom sheet (PATCH/DELETE /meal-logs/:id). Days are UTC
 * days, as the API defines them.
 */
export function NutritionCalendarScreen(_props: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editing, setEditing] = useState<DayMeal | null>(null);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const dateKey = selectedDay !== null ? `${monthKey}-${String(selectedDay).padStart(2, "0")}` : null;

  const calendarQuery = useQuery({
    queryKey: ["nutrition", "calendar", monthKey],
    queryFn: () => fetchNutritionCalendar(monthKey),
  });
  const summaryQuery = useQuery({
    queryKey: ["nutrition", "summary", dateKey],
    queryFn: () => fetchNutritionSummary(dateKey as string),
    enabled: dateKey !== null,
  });

  const caloriesByDay = useMemo(() => {
    const map = new Map<number, { calories: number; mealCount: number }>();
    for (const d of calendarQuery.data?.days ?? []) {
      if (d.mealCount > 0) map.set(Number(d.date.slice(8, 10)), { calories: d.calories, mealCount: d.mealCount });
    }
    return map;
  }, [calendarQuery.data]);

  const complianceByDay = useMemo(() => {
    const map = new Map<number, Compliance>();
    for (const [day, v] of caloriesByDay.entries()) map.set(day, complianceFor(v.calories));
    return map;
  }, [caloriesByDay]);

  const monthlyStats = useMemo(() => {
    const values = Array.from(complianceByDay.values());
    const totalCalories = Array.from(caloriesByDay.values()).reduce((sum, v) => sum + v.calories, 0);
    const mealsLogged = Array.from(caloriesByDay.values()).reduce((sum, v) => sum + v.mealCount, 0);
    return {
      daysWithLogs: caloriesByDay.size,
      onTrackDays: values.filter((c) => c === "onTrack").length,
      underDays: values.filter((c) => c === "under").length,
      overDays: values.filter((c) => c === "over").length,
      mealsLogged,
      avgCalories: caloriesByDay.size > 0 ? Math.round(totalCalories / caloriesByDay.size) : 0,
    };
  }, [caloriesByDay, complianceByDay]);

  if (calendarQuery.isError) {
    return (
      <ScreenContainer title="Nutrition Calendar">
        <ErrorState onRetry={() => calendarQuery.refetch()} />
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

  const dayTotals = summaryQuery.data?.totals;
  const dayMeals = summaryQuery.data?.meals ?? [];
  const selectedCompliance = selectedDay !== null ? complianceByDay.get(selectedDay) ?? "none" : "none";

  return (
    <ScreenContainer title="Nutrition Calendar">
      {calendarQuery.isLoading ? <Skeleton height={90} /> : null}
      {!calendarQuery.isLoading && monthlyStats.daysWithLogs === 0 ? (
        <EmptyState title="No meals logged this month" subtitle="Log a meal from the Nutrition Dashboard, or browse another month." />
      ) : null}

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
          <Pressable onPress={() => goToMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10}>
            <Text style={{ color: colors.accent, ...typography.h2 }}>{"‹"}</Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary }}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <Pressable onPress={() => goToMonth(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10}>
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
            <Pill label={complianceLabel(selectedCompliance)} tone={complianceTone(selectedCompliance)} />
          </View>
          {summaryQuery.isError ? (
            <ErrorState onRetry={() => summaryQuery.refetch()} />
          ) : summaryQuery.isLoading || !dayTotals ? (
            <Skeleton height={60} />
          ) : dayMeals.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>No meals logged this day.</Text>
          ) : (
            <>
              <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
                {dayTotals.calories} kcal · {dayTotals.proteinG}g protein · {dayTotals.carbsG}g carbs · {dayTotals.fatG}g fat
              </Text>
              {dayMeals.map((log) => (
                <Pressable
                  key={log.id}
                  onPress={() => setEditing(log)}
                  accessibilityRole="button"
                  accessibilityLabel={`${log.name}, ${log.calories} kilocalories. Edit or delete`}
                  style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs + 2 }}
                >
                  <Text style={{ color: colors.textPrimary, flex: 1 }}>{log.name}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>{log.calories} kcal · Edit</Text>
                </Pressable>
              ))}
            </>
          )}
        </Card>
      ) : null}

      <MealEditSheet meal={editing} onClose={() => setEditing(null)} />
    </ScreenContainer>
  );
}

/** Edit or delete one logged meal (PATCH/DELETE /meal-logs/:id); sends only changed fields. */
function MealEditSheet({ meal, onClose }: { meal: DayMeal | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType>("snack");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (meal) {
      setName(meal.name);
      setMealType(meal.mealType);
      setCalories(String(meal.calories));
      setProtein(String(meal.proteinG));
      setCarbs(String(meal.carbsG));
      setFat(String(meal.fatG));
      setError(null);
    }
  }, [meal]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["nutrition"] });
    queryClient.invalidateQueries({ queryKey: ["mealLogs"] });
  };

  const save = useMutation({
    mutationFn: (input: UpdateMealLogInput) => updateMealLog((meal as DayMeal).id, input),
    onSuccess: () => {
      refresh();
      toast.show("Meal updated", "success");
      onClose();
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't update that meal."), "error"),
  });
  const remove = useMutation({
    mutationFn: () => deleteMealLog((meal as DayMeal).id),
    onSuccess: () => {
      refresh();
      toast.show("Meal deleted", "success");
      onClose();
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't delete that meal."), "error"),
  });

  const onSave = () => {
    if (!meal) return;
    const num = (v: string) => Number(v.replace(",", "."));
    const cal = num(calories);
    const p = num(protein);
    const c = num(carbs);
    const f = num(fat);
    if (!name.trim()) {
      setError("Give the meal a name.");
      return;
    }
    if ([cal, p, c, f].some((n) => !Number.isFinite(n) || n < 0)) {
      setError("Calories and macros must be zero or more.");
      return;
    }
    const input: UpdateMealLogInput = {};
    if (name.trim() !== meal.name) input.name = name.trim();
    if (mealType !== meal.mealType) input.mealType = mealType;
    if (Math.round(cal) !== meal.calories) input.calories = Math.round(cal);
    if (p !== meal.proteinG) input.proteinG = p;
    if (c !== meal.carbsG) input.carbsG = c;
    if (f !== meal.fatG) input.fatG = f;
    if (Object.keys(input).length === 0) {
      onClose();
      return;
    }
    setError(null);
    save.mutate(input);
  };

  const confirmDelete = () =>
    Alert.alert("Delete this meal?", "It will be removed from your log and daily totals.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
    ]);

  return (
    <BottomSheet visible={meal !== null} onClose={onClose} title="Edit meal">
      <TextField label="Name" value={name} onChangeText={setName} maxLength={120} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {MEAL_TYPES.map((t) => (
          <Chip key={t.value} label={t.label} selected={mealType === t.value} onPress={() => setMealType(t.value)} />
        ))}
      </View>
      <TextField label="Calories (kcal)" value={calories} onChangeText={setCalories} keyboardType="number-pad" />
      <TextField label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" />
      <TextField label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
      <TextField label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" error={error} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button label="Delete" variant="secondary" onPress={confirmDelete} loading={remove.isPending} style={{ flex: 1 }} />
        <Button label="Save" onPress={onSave} loading={save.isPending} style={{ flex: 1 }} />
      </View>
    </BottomSheet>
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
