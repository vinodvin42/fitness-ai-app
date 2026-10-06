import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealType, NutritionDaySummary, UpdateMealLogInput } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Icon } from "../../components/Icon";
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
import { DAILY_TARGETS } from "../../lib/nutritionTargets";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "NutritionCalendar">;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Compliance definitions (documented here, used by the day dots, the target
 * details card and Monthly Balance), measured against the app-wide default
 * daily calorie target (no per-user target is modeled yet):
 *   - "Perfect day"  : calories within +/-10% of target  -> "On Target"
 *   - "Close target" : more than 10% but within +/-20%   -> "Close"
 *   - otherwise "Under target" (below -20%) or "Over target" (above +20%).
 * Days with no logged meal are "none" and are not counted anywhere.
 */
const PERFECT_TOLERANCE = 0.1;
const CLOSE_TOLERANCE = 0.2;

type Compliance = "perfect" | "close" | "under" | "over" | "none";

export function complianceFor(totalCalories: number, target: number = DAILY_TARGETS.calories): Compliance {
  if (totalCalories <= 0) return "none";
  const delta = (totalCalories - target) / target;
  if (Math.abs(delta) <= PERFECT_TOLERANCE) return "perfect";
  if (Math.abs(delta) <= CLOSE_TOLERANCE) return "close";
  return delta < 0 ? "under" : "over";
}

function complianceColor(c: Compliance): string {
  if (c === "perfect") return colors.success;
  if (c === "close") return colors.warning;
  if (c === "over") return colors.danger;
  if (c === "under") return colors.accent;
  return colors.textSecondary;
}

function complianceLabel(c: Compliance): string {
  if (c === "perfect") return "On Target";
  if (c === "close") return "Close";
  if (c === "over") return "Over target";
  if (c === "under") return "Under target";
  return "No log";
}

type DayMeal = NutritionDaySummary["meals"][number];

const MEAL_TYPES: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

/**
 * Nutrition History (Figma Fuel 07): month grid with a compliance dot per
 * logged day, "<date> Target Details" (Total Cal + Compliance) for the
 * selected day, and "Monthly Balance" (Perfect Days / Close target — see the
 * definitions above). Backed by `GET /nutrition/calendar?month=` and
 * `GET /nutrition/summary?date=`; the selected day's meals can still be edited
 * or deleted from a bottom sheet (PATCH/DELETE /meal-logs/:id). Days are UTC
 * days, as the API defines them.
 */
export function NutritionCalendarScreen(_props: Props) {
  const { colors: theme } = useTheme();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());
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

  const balance = useMemo(() => {
    const values = Array.from(complianceByDay.values());
    return {
      daysWithLogs: caloriesByDay.size,
      perfect: values.filter((c) => c === "perfect").length,
      close: values.filter((c) => c === "close").length,
    };
  }, [caloriesByDay, complianceByDay]);

  if (calendarQuery.isError) {
    return (
      <ScreenContainer title="Nutrition History">
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
  const toTarget = dayTotals ? dayTotals.calories - DAILY_TARGETS.calories : 0;

  const monthNav = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
      <Pressable onPress={() => goToMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10} style={styles.navBtn}>
        <Icon name="chevron-left" size={20} color={colors.textPrimary} />
      </Pressable>
      <Pressable onPress={() => goToMonth(1)} accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10} style={styles.navBtn}>
        <Icon name="chevron-right" size={20} color={colors.textPrimary} />
      </Pressable>
    </View>
  );

  return (
    <ScreenContainer title="Nutrition History" subtitle={`${MONTH_NAMES[month]} ${year}`} right={monthNav}>
      {calendarQuery.isLoading ? <Skeleton height={90} /> : null}

      <View>
        <View style={{ flexDirection: "row" }}>
          {WEEKDAY_LABELS.map((label, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: spacing.xs }}>
              <Text style={{ color: colors.textMuted, ...typography.label, fontSize: 12 }}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((day, i) => {
            const compliance = day ? complianceByDay.get(day) ?? "none" : "none";
            const selected = day !== null && day === selectedDay;
            return (
              <Pressable
                key={i}
                disabled={!day}
                onPress={() => day && setSelectedDay(day === selectedDay ? null : day)}
                accessibilityRole="button"
                accessibilityLabel={day ? `${MONTH_NAMES[month]} ${day}${compliance !== "none" ? `, ${complianceLabel(compliance)}` : ""}` : undefined}
                style={{ width: "14.2857%", alignItems: "center", paddingVertical: 3 }}
              >
                {day ? (
                  <View
                    style={{
                      width: 36,
                      height: 40,
                      borderRadius: radius.sm,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: selected ? theme.accent : "transparent",
                      backgroundColor: selected ? theme.accentSoft : "transparent",
                    }}
                  >
                    <Text style={{ color: selected ? theme.accent : colors.textPrimary, ...typography.label, fontSize: 13 }}>{day}</Text>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 2.5,
                        marginTop: 3,
                        backgroundColor: compliance !== "none" ? complianceColor(compliance) : "transparent",
                      }}
                    />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {!calendarQuery.isLoading && balance.daysWithLogs === 0 ? (
        <EmptyState title="No meals logged this month" subtitle="Log a meal from Nutrition, or browse another month." />
      ) : null}

      {selectedDay !== null ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>
            {MONTH_NAMES[month]} {selectedDay} Target Details
          </Text>
          {summaryQuery.isError ? (
            <ErrorState onRetry={() => summaryQuery.refetch()} />
          ) : summaryQuery.isLoading || !dayTotals ? (
            <Skeleton height={70} />
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <DetailTile label="Total Cal">
                  <Text style={styles.tileValue}>{dayTotals.calories.toLocaleString()} kcal</Text>
                  <Text style={{ color: colors.textMuted, ...typography.caption }}>
                    {dayMeals.length === 0
                      ? "Nothing logged"
                      : toTarget === 0
                        ? "On the target"
                        : `${toTarget > 0 ? "+" : "−"}${Math.abs(toTarget).toLocaleString()} to target`}
                  </Text>
                </DetailTile>
                <DetailTile label="Compliance">
                  <Text style={[styles.tileValue, { color: complianceColor(selectedCompliance) }]}>{complianceLabel(selectedCompliance)}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.caption }}>
                    {dayMeals.length === 0
                      ? "—"
                      : dayTotals.proteinG >= DAILY_TARGETS.proteinG
                        ? `Protein hit (${dayTotals.proteinG}g)`
                        : `Protein ${dayTotals.proteinG}g of ${DAILY_TARGETS.proteinG}g`}
                  </Text>
                </DetailTile>
              </View>

              {dayMeals.length > 0 ? (
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xs,
                  }}
                >
                  {dayMeals.map((log, idx) => (
                    <Pressable
                      key={log.id}
                      onPress={() => setEditing(log)}
                      accessibilityRole="button"
                      accessibilityLabel={`${log.name}, ${log.calories} kilocalories. Edit or delete`}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingVertical: spacing.sm + 2,
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 14, flex: 1 }} numberOfLines={1}>
                        {log.name}
                      </Text>
                      <Text style={{ color: colors.textMuted, ...typography.meta }}>{log.calories} kcal · Edit</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={{ color: colors.textMuted, ...typography.meta }}>No meals logged this day.</Text>
              )}
            </>
          )}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>Monthly Balance</Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.md,
          }}
        >
          <View>
            <Text style={{ color: colors.textMuted, ...typography.caption }}>Perfect Days</Text>
            <Text style={{ color: colors.success, fontSize: 20, fontFamily: fonts.displayBold }}>
              {balance.perfect} {balance.perfect === 1 ? "Day" : "Days"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: colors.textMuted, ...typography.caption }}>Close target</Text>
            <Text style={{ color: colors.warning, fontSize: 20, fontFamily: fonts.displayBold }}>
              {balance.close} {balance.close === 1 ? "Day" : "Days"}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          Perfect = within 10% of your {DAILY_TARGETS.calories.toLocaleString()} kcal target; close = within 20%. {balance.daysWithLogs} logged{" "}
          {balance.daysWithLogs === 1 ? "day" : "days"} this month.
        </Text>
      </View>

      <MealEditSheet meal={editing} onClose={() => setEditing(null)} />
    </ScreenContainer>
  );
}

function DetailTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 2,
      }}
    >
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
      {children}
    </View>
  );
}

const styles = {
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tileValue: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.displayBold },
} as const;

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
