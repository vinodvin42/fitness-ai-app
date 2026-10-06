import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealType, Reminder } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchReminders } from "../../api/reminders";
import { fetchNextWorkout } from "../../api/plans";
import { fetchCurrentMealPlan } from "../../api/mealPlans";
import { fetchDueMedications, localDateString } from "../../api/medications";
import { formatTimeOfDay } from "../../lib/format";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = NativeStackScreenProps<TodayStackParamList, "Schedule">;

// Monday-first, matching Figma Today 04 (M T W T F S S).
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "snack", "dinner"];
const MEAL_LABEL: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };

type Tag = "Workout" | "Nutrition" | "Recovery" | "Hydration" | "Medicine" | "Progress" | "Reminder";
const TAG_STYLE: Record<Tag, { fg: string; bg: string }> = {
  Workout: { fg: colors.accent, bg: colors.accentSoft },
  Nutrition: { fg: colors.success, bg: colors.successSoft },
  Recovery: { fg: colors.aiAccent, bg: colors.aiAccentSoft },
  Hydration: { fg: colors.cyan, bg: "rgba(34,211,238,0.16)" },
  Medicine: { fg: colors.warning, bg: colors.warningSoft },
  Progress: { fg: colors.warning, bg: colors.warningSoft },
  Reminder: { fg: colors.aiAccent, bg: colors.aiAccentSoft },
};
const REMINDER_TAG: Record<Reminder["category"], Tag> = {
  workout: "Workout",
  meal: "Nutrition",
  water: "Hydration",
  measurement: "Progress",
  general: "Reminder",
};

/** The 7 days of the current week, Monday first. */
function currentWeek(): Date[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

interface EventRow {
  key: string;
  /** Sort key: minutes since midnight for timed rows, negative/large for plan items. */
  order: number;
  timeLabel: string;
  title: string;
  subtitle: string;
  tag: Tag;
  onPress?: () => void;
}

/**
 * Today 04 - My Schedule (Figma frame 04): week strip + vertical timeline.
 * Built only from data the app really has: the user's reminders by weekday,
 * today's due medications, the next workout from the active Plan (today only
 * - the Plan resolves a "next" workout, not dated future ones) and the meal
 * plan's meals for the selected day. Plan items carry no clock time, so their
 * left label is "Plan" / the meal slot rather than an invented time.
 */
export function ScheduleScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const week = useMemo(currentWeek, []);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [selected, setSelected] = useState(todayIdx);

  const reminders = useQuery({ queryKey: ["reminders"], queryFn: fetchReminders });
  const next = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout });
  const mealPlan = useQuery({ queryKey: ["mealPlan", "current"], queryFn: fetchCurrentMealPlan });
  const meds = useQuery({
    queryKey: ["medications", "due", localDateString()],
    queryFn: () => fetchDueMedications(localDateString()),
  });

  const selectedDate = week[selected];
  const isTodaySelected = selected === todayIdx;
  const parent = navigation.getParent<NavigationProp<MainTabsParamList>>();

  const items = useMemo(() => {
    const rows: EventRow[] = [];
    const jsDay = selectedDate.getDay();
    for (const r of reminders.data ?? []) {
      if (r.isEnabled && r.daysOfWeek.includes(jsDay)) {
        const d = new Date();
        d.setHours(r.hour, r.minute, 0, 0);
        rows.push({
          key: `r-${r.id}`,
          order: r.hour * 60 + r.minute,
          timeLabel: formatTimeOfDay(d),
          title: r.label,
          subtitle: `${REMINDER_TAG[r.category]} reminder`,
          tag: REMINDER_TAG[r.category],
          onPress: () => parent?.navigate("More", { screen: "Reminders" }),
        });
      }
    }
    if (isTodaySelected) {
      for (const d of meds.data?.items ?? []) {
        const when = new Date(d.scheduledFor);
        rows.push({
          key: `m-${d.medicationId}-${d.scheduledFor}`,
          order: when.getHours() * 60 + when.getMinutes(),
          timeLabel: formatTimeOfDay(when),
          title: d.name,
          subtitle: d.status === "taken" ? "Taken" : d.status === "skipped" ? "Skipped" : "Medicine reminder",
          tag: "Medicine",
          onPress: () =>
            parent?.navigate("More", {
              screen: "MedicineOccurrence",
              params: { medicationId: d.medicationId, scheduledFor: d.scheduledFor },
            }),
        });
      }
      const w = next.data?.workout;
      if (w) {
        rows.push({
          key: `w-${w.id}`,
          order: -1,
          timeLabel: "Plan",
          title: w.name,
          subtitle: `${w.durationMinutes} min • ${next.data?.plan.programName ?? "Your plan"}`,
          tag: "Workout",
          onPress: () => parent?.navigate("Train", { screen: "WorkoutDetail", params: { workoutId: w.id } }),
        });
      }
    }
    const plan = mealPlan.data;
    if (plan && plan.status === "generated") {
      const daysSince = Math.round((selectedDate.getTime() - new Date(new Date(plan.createdAt).toDateString()).getTime()) / 86_400_000);
      if (daysSince >= 0) {
        const day = (daysSince % Math.max(1, plan.durationDays)) + 1;
        for (const m of plan.items.filter((i) => i.dayNumber === day)) {
          rows.push({
            key: `p-${m.id}`,
            order: 10_000 + MEAL_ORDER.indexOf(m.mealType),
            timeLabel: MEAL_LABEL[m.mealType],
            title: m.recipeName,
            subtitle: `${Math.round(m.calories)} kcal • ${Math.round(m.proteinG)}g protein`,
            tag: "Nutrition",
            onPress: () => parent?.navigate("Fuel", { screen: "RecipeDetail", params: { recipeId: m.recipeId } }),
          });
        }
      }
    }
    return rows.sort((a, b) => a.order - b.order);
  }, [reminders.data, next.data, mealPlan.data, meds.data, selectedDate, isTodaySelected, parent]);

  const isLoading = reminders.isLoading || next.isLoading;
  const isError = reminders.isError && next.isError;
  const dateLine = selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  return (
    <ScreenContainer
      title="My Schedule"
      subtitle={dateLine}
      right={
        <Pressable
          onPress={() => parent?.navigate("More", { screen: "ReminderForm", params: {} })}
          accessibilityRole="button"
          accessibilityLabel="Add reminder"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="plus" size={22} color={theme.textOnAccent} />
        </Pressable>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
        {week.map((d, i) => {
          const active = i === selected;
          return (
            <Pressable
              key={i}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                height: 64,
                borderRadius: radius.md,
                backgroundColor: active ? theme.accent : colors.surface,
                borderWidth: 1,
                borderColor: active ? theme.accent : colors.border,
              }}
            >
              <Text style={{ color: active ? theme.textOnAccent : colors.textSecondary, ...typography.caption }}>{DAY_LABELS[i]}</Text>
              <Text style={{ color: active ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>
                {d.getDate()}
              </Text>
              <View
                style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: i === todayIdx ? (active ? theme.textOnAccent : theme.accent) : "transparent" }}
              />
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: colors.textMuted, ...typography.label, marginTop: spacing.xs }}>
        {isTodaySelected ? "Today's Events" : `${selectedDate.toLocaleDateString(undefined, { weekday: "long" })}'s Events`}
      </Text>

      {isLoading ? (
        <SkeletonCard lines={2} />
      ) : isError ? (
        <ErrorState
          message="Couldn't load your schedule."
          onRetry={() => {
            reminders.refetch();
            next.refetch();
          }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          subtitle="Reminders, medicine, your next workout and meal-plan meals will appear here."
          actionLabel="Add reminder"
          onAction={() => parent?.navigate("More", { screen: "ReminderForm", params: {} })}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {items.map((it) => (
            <View key={it.key} style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
              <Text style={{ width: 62, color: colors.textSecondary, fontSize: 12, paddingTop: 14, textAlign: "left" }}>{it.timeLabel}</Text>
              <Pressable
                onPress={it.onPress}
                disabled={!it.onPress}
                accessibilityRole={it.onPress ? "button" : undefined}
                accessibilityLabel={`${it.timeLabel}, ${it.title}, ${it.tag}`}
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.card,
                  padding: 14,
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 15, flex: 1 }} numberOfLines={1}>
                    {it.title}
                  </Text>
                  <View style={{ backgroundColor: TAG_STYLE[it.tag].bg, borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: TAG_STYLE[it.tag].fg, fontSize: 10 }}>{it.tag}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {it.subtitle}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
