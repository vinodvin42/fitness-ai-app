import { useMemo } from "react";
import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchTodayMealLogs, fetchTodayWaterLogs } from "../api/nutrition";
import { fetchWorkoutHistory } from "../api/workoutSessions";
import { fetchNextWorkout } from "../api/plans";
import { fetchReminders } from "../api/reminders";
import { useWorkoutSettings } from "../api/workoutSettings";
import { formatTimeOfDay } from "../lib/format";
import { DAILY_TARGETS } from "../lib/nutritionTargets";
import { WATER_GOAL_GLASSES } from "../lib/hydration";
import { useMeasureUnits } from "../lib/measureUnits";
import { buildTodayWidgetSnapshot, todayWorkoutState, widgetDay, workoutReminderTime } from "../lib/todayWidget";
import { useTodayWidget } from "./todayWidgetUpdate";

/**
 * Called from Today: builds the widget snapshot from the same queries Today
 * shows (same keys, so React Query serves them from cache) and publishes it
 * when it changes, e.g. after logging water or a meal, or finishing a workout.
 * Nothing is written until every part has loaded, so the widget never shows
 * a half-loaded zero. Off Android this does nothing.
 */
export function useTodayWidgetSync(): void {
  const android = Platform.OS === "android";
  const water = useQuery({ queryKey: ["waterLogs", "today"], queryFn: fetchTodayWaterLogs, enabled: android });
  const history = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory, enabled: android });
  const next = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout, enabled: android });
  const meals = useQuery({ queryKey: ["mealLogs", "today"], queryFn: fetchTodayMealLogs, enabled: android });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: fetchReminders, enabled: android, staleTime: 5 * 60_000 });
  const { data: workoutSettings } = useWorkoutSettings();
  const units = useMeasureUnits();
  const day = widgetDay(new Date());

  const snapshot = useMemo(() => {
    if (!android || !water.data || !history.data || next.data === undefined || !meals.data) return null;
    const now = new Date();
    const proteinEaten = meals.data.reduce((sum, m) => sum + m.proteinG, 0);
    return buildTodayWidgetSnapshot({
      now,
      nextWorkoutName: next.data?.workout?.name ?? null,
      programComplete: !!next.data?.programComplete,
      ...todayWorkoutState(history.data, workoutSettings?.trainingDays, now),
      workoutTime: workoutReminderTime(reminders.data, now, formatTimeOfDay),
      waterGlasses: water.data.reduce((sum, w) => sum + w.glasses, 0),
      waterGoalGlasses: WATER_GOAL_GLASSES,
      waterUnit: units.waterUnit,
      proteinLeftG: DAILY_TARGETS.proteinG - proteinEaten,
      proteinTargetG: DAILY_TARGETS.proteinG,
    });
    // `day` re-runs this after midnight.
  }, [android, water.data, history.data, next.data, meals.data, reminders.data, workoutSettings?.trainingDays, units.waterUnit, day]);

  useTodayWidget(snapshot);
}
