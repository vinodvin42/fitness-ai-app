import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { ListRow } from "../../components/ListRow";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchReminders } from "../../api/reminders";
import { fetchNextWorkout } from "../../api/plans";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = NativeStackScreenProps<TodayStackParamList, "Schedule">;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function formatTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** The 7 days of the current week (Sun–Sat) as Date objects. */
function currentWeek(): Date[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * Today 04 — Schedule. Week strip + timeline built entirely from data the
 * app already has: the user's reminders (by weekday) and, for today only,
 * the next workout from the active Plan. The API has no calendar/schedule
 * endpoint, and the Plan only resolves a "next" workout, not dated future
 * ones — so other days honestly show reminders only.
 */
export function ScheduleScreen({ navigation }: Props) {
  const week = useMemo(currentWeek, []);
  const todayIndex = new Date().getDay();
  const [selected, setSelected] = useState(todayIndex);

  const reminders = useQuery({ queryKey: ["reminders"], queryFn: fetchReminders });
  const next = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout });

  const items = useMemo(() => {
    const rows: Array<{
      key: string;
      minutes: number;
      icon: "bell" | "dumbbell";
      title: string;
      subtitle: string;
      onPress?: () => void;
    }> = [];
    for (const r of reminders.data ?? []) {
      if (r.isEnabled && r.daysOfWeek.includes(selected)) {
        rows.push({
          key: `r-${r.id}`,
          minutes: r.hour * 60 + r.minute,
          icon: "bell",
          title: r.label,
          subtitle: `${formatTime(r.hour, r.minute)} · ${r.category}`,
        });
      }
    }
    const w = next.data?.workout;
    if (selected === todayIndex && w) {
      rows.push({
        key: `w-${w.id}`,
        minutes: -1, // unscheduled workout sorts first, above timed reminders
        icon: "dumbbell",
        title: w.name,
        subtitle: `Today's workout · ${next.data?.plan.programName ?? "Your plan"}`,
        onPress: () =>
          navigation.getParent()?.navigate("Train", { screen: "WorkoutDetail", params: { workoutId: w.id } }),
      });
    }
    return rows.sort((a, b) => a.minutes - b.minutes);
  }, [reminders.data, next.data, selected, todayIndex, navigation]);

  const isLoading = reminders.isLoading || next.isLoading;
  const isError = reminders.isError && next.isError;

  return (
    <ScreenContainer title="Schedule">
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
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
                alignItems: "center",
                gap: 4,
                paddingVertical: spacing.sm,
                width: 44,
                borderRadius: radius.md,
                backgroundColor: active ? colors.accent : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.border,
              }}
            >
              <Text style={{ color: active ? colors.textOnAccent : colors.textMuted, ...typography.caption }}>
                {DAY_LABELS[i]}
              </Text>
              <Text
                style={{ color: active ? colors.textOnAccent : colors.textPrimary, fontFamily: fonts.mono, fontSize: 15 }}
              >
                {d.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
        <EmptyState title="Nothing scheduled" subtitle="Reminders and your next workout will appear here." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((it) => (
            <ListRow key={it.key} icon={it.icon} title={it.title} subtitle={it.subtitle} onPress={it.onPress} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
