import React, { useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { BackButton } from "../../components/BackButton";
import { Icon, type IconName } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { fetchReminders, updateReminder } from "../../api/reminders";
import { fetchDueMedications, fetchMedications, localDateString, updateMedication } from "../../api/medications";
import { fetchRoutines, ROUTINES_KEY } from "../../api/routines";
import { fetchWorkoutHistory } from "../../api/workoutSessions";
import { useReminderSync } from "../../lib/useReminderSync";
import {
  composeHistory,
  composeScheduled,
  composeToday,
  composeUpcoming,
  formatMinutes,
  type AgendaItem,
} from "../../lib/agenda";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { TrainStackParamList } from "../../navigation/TrainStack";
import type { MainTabsParamList } from "../../navigation/MainTabs";

type Props = NativeStackScreenProps<TrainStackParamList, "RemindersRoutines">;
type Tab = "today" | "upcoming" | "scheduled" | "history";
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "scheduled", label: "Scheduled" },
  { value: "history", label: "History" },
];

const META: Record<AgendaItem["category"], { icon: IconName; tint: string }> = {
  workout: { icon: "dumbbell", tint: colors.aiAccent },
  meal: { icon: "utensils", tint: colors.success },
  water: { icon: "droplet", tint: colors.accent },
  measurement: { icon: "trending-up", tint: colors.warning },
  general: { icon: "bell", tint: colors.cyan },
  medication: { icon: "pill", tint: colors.danger },
  routine: { icon: "dumbbell", tint: colors.accent },
};

/**
 * Reminders & Routines (Figma Train 13): one list over three existing sources.
 * Reminders (GET /reminders) and medications (GET /medications, plus today's
 * dose states from /medications/due) have on/off switches that call their own
 * update endpoints; saved routines (GET /routines) appear under Scheduled with
 * a Start action. Today's completed workouts and taken/skipped doses make up
 * History. No new endpoints.
 */
export function RemindersRoutinesScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const tabs = useNavigation<NavigationProp<MainTabsParamList>>();
  const [tab, setTab] = useState<Tab>("today");
  const today = useMemo(() => new Date(), []);
  const dateKey = localDateString(today);

  const remindersQ = useQuery({ queryKey: ["reminders"], queryFn: fetchReminders });
  const medsQ = useQuery({ queryKey: ["medications"], queryFn: fetchMedications });
  const dueQ = useQuery({ queryKey: ["medications", "due", dateKey], queryFn: () => fetchDueMedications(dateKey) });
  const routinesQ = useQuery({ queryKey: ROUTINES_KEY, queryFn: fetchRoutines });
  const historyQ = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory });

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    }, [queryClient]),
  );

  // Keep on-device notifications in step with the reminder switches (same rule as the Reminders list).
  const reminders = remindersQ.data;
  useReminderSync(reminders, () => navigation.getParent()?.navigate("More", { screen: "NotificationPermission" }));

  const toggle = useMutation({
    mutationFn: async ({ item, on }: { item: AgendaItem; on: boolean }) => {
      if (item.kind === "reminder") await updateReminder(item.id, { isEnabled: on });
      else if (item.kind === "medication") await updateMedication(item.id, { isActive: on });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't update that item."), "error"),
  });

  const isLoading = remindersQ.isLoading || medsQ.isLoading || dueQ.isLoading || routinesQ.isLoading;
  const isError = remindersQ.isError || medsQ.isError;

  const todayItems = useMemo(
    () => composeToday(remindersQ.data ?? [], dueQ.data?.items ?? [], medsQ.data ?? [], today),
    [remindersQ.data, dueQ.data, medsQ.data, today],
  );
  const doneDoses = useMemo(() => composeHistory(dueQ.data?.items ?? []), [dueQ.data]);
  const doneWorkouts = (historyQ.data ?? []).filter(
    (h) => h.status === "completed" && new Date(h.startedAt).toDateString() === today.toDateString(),
  );
  const upcoming = useMemo(() => composeUpcoming(remindersQ.data ?? [], medsQ.data ?? [], today), [remindersQ.data, medsQ.data, today]);
  const scheduled = useMemo(
    () => composeScheduled(remindersQ.data ?? [], medsQ.data ?? [], routinesQ.data ?? []),
    [remindersQ.data, medsQ.data, routinesQ.data],
  );
  const historyCount = doneDoses.length + doneWorkouts.length;

  const addReminder = () => tabs.navigate("More", { screen: "ReminderForm", params: {} });
  const openItem = (item: AgendaItem) => {
    if (item.kind === "reminder" && item.reminder) tabs.navigate("More", { screen: "ReminderForm", params: { reminder: item.reminder } });
    else if (item.kind === "medication") tabs.navigate("More", { screen: "MedicineDue" });
    else if (item.kind === "routine") navigation.navigate("Routines");
  };

  const hasWorkoutReminder = (remindersQ.data ?? []).some((r) => r.category === "workout" && r.isEnabled);

  const row = (item: AgendaItem, opts?: { done?: boolean }) => {
    const meta = META[item.category];
    const done = opts?.done;
    return (
      <Card key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md - 2 }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: meta.tint, alignItems: "center", justifyContent: "center" }}>
          <Icon name={meta.icon} size={19} color="#0b0b0e" />
        </View>
        <Pressable style={{ flex: 1 }} onPress={() => openItem(item)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.subtitle}`}>
          <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>{item.title}</Text>
          <Text style={{ color: item.doseStatus === "missed" ? colors.warning : colors.textMuted, ...typography.meta }}>{item.subtitle}</Text>
        </Pressable>
        {done ? (
          <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 11 }}>
              {item.doseStatus === "skipped" ? "Skipped" : "Completed"}
            </Text>
          </View>
        ) : item.kind === "routine" ? (
          <Pressable
            onPress={() => navigation.navigate("Routines")}
            accessibilityRole="button"
            accessibilityLabel={`Open routine ${item.title}`}
            style={{ backgroundColor: theme.accentSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}
          >
            <Text style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 11 }}>Open</Text>
          </Pressable>
        ) : item.enabled !== undefined ? (
          <>
            <Icon name={item.enabled ? "bell" : "bell-off"} size={16} color={item.enabled ? theme.accent : colors.textMuted} />
            <Switch
              value={item.enabled}
              onValueChange={(on) => toggle.mutate({ item, on })}
              accessibilityLabel={`${item.title} on or off`}
              trackColor={{ true: theme.accent, false: colors.surfaceHigh }}
              thumbColor={colors.textPrimary}
            />
          </>
        ) : null}
      </Card>
    );
  };

  const sectionHeader = (title: string, right?: string) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{title}</Text>
      {right ? <Text style={{ color: colors.textMuted, ...typography.meta }}>{right}</Text> : null}
    </View>
  );

  return (
    <ScreenContainer
      title="Reminders & Routines"
      right={
        <Pressable
          onPress={addReminder}
          accessibilityRole="button"
          accessibilityLabel="Add reminder"
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceHigh, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="plus" size={17} color={colors.textPrimary} />
        </Pressable>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {TABS.map((t) => {
          const on = t.value === tab;
          return (
            <Pressable
              key={t.value}
              onPress={() => setTab(t.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 7,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: on ? theme.accent : colors.border,
                backgroundColor: on ? theme.accent : colors.surface,
              }}
            >
              <Text style={{ color: on ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isError ? (
        <ErrorState onRetry={() => { remindersQ.refetch(); medsQ.refetch(); }} />
      ) : isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : (
        <>
          {tab === "today" ? (
            <>
              {sectionHeader("Today", `${todayItems.length} due`)}
              {todayItems.length === 0 ? (
                <EmptyState title="Nothing due today" subtitle="Reminders and medicine doses for today show up here." actionLabel="Add reminder" onAction={addReminder} />
              ) : (
                todayItems.map((i) => row(i))
              )}
              {historyCount > 0 ? (
                <>
                  {sectionHeader("History", `${historyCount} completed`)}
                  {doneDoses.map((i) => row(i, { done: true }))}
                  {doneWorkouts.map((w) => (
                    <Card key={w.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md - 2 }}>
                      <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.aiAccent, alignItems: "center", justifyContent: "center" }}>
                        <Icon name="dumbbell" size={19} color="#0b0b0e" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>{w.workoutName}</Text>
                        <Text style={{ color: colors.textMuted, ...typography.meta }}>
                          {formatMinutes(new Date(w.startedAt).getHours() * 60 + new Date(w.startedAt).getMinutes())} · Workout
                        </Text>
                      </View>
                      <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 11 }}>Completed</Text>
                      </View>
                    </Card>
                  ))}
                </>
              ) : null}
            </>
          ) : null}

          {tab === "upcoming" ? (
            upcoming.length === 0 ? (
              <EmptyState title="Nothing coming up" subtitle="Enabled reminders and active medicines for the next few days appear here." actionLabel="Add reminder" onAction={addReminder} />
            ) : (
              upcoming.map((d) => (
                <View key={d.label} style={{ gap: spacing.sm }}>
                  {sectionHeader(d.label, `${d.items.length} scheduled`)}
                  {d.items.map((i) => row(i))}
                </View>
              ))
            )
          ) : null}

          {tab === "scheduled" ? (
            scheduled.length === 0 ? (
              <EmptyState title="No recurring items" subtitle="Reminders, medicines and saved routines are listed here." actionLabel="Add reminder" onAction={addReminder} />
            ) : (
              <>
                {sectionHeader("Scheduled", `${scheduled.length} item${scheduled.length === 1 ? "" : "s"}`)}
                {scheduled.map((i) => row(i))}
              </>
            )
          ) : null}

          {tab === "history" ? (
            historyCount === 0 ? (
              <EmptyState title="Nothing completed yet today" subtitle="Doses you take or skip and workouts you finish today are listed here." />
            ) : (
              <>
                {sectionHeader("History", `${historyCount} completed`)}
                {doneDoses.map((i) => row(i, { done: true }))}
                {doneWorkouts.map((w) => (
                  <Card key={w.id} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <Icon name="dumbbell" size={18} color={colors.aiAccent} />
                    <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14, flex: 1 }}>{w.workoutName}</Text>
                    <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 11 }}>Completed</Text>
                  </Card>
                ))}
              </>
            )
          ) : null}

          {(remindersQ.data ?? []).length > 0 && !hasWorkoutReminder ? (
            <Card style={{ borderColor: colors.aiBorder, backgroundColor: colors.aiSurface, gap: spacing.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="sparkles" size={13} color={colors.aiAccent} />
                <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6 }}>FYNROX RECOMMENDATION</Text>
              </View>
              <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
                You have no workout reminder switched on. A nudge before your training days makes sessions easier to keep.
              </Text>
              <Pressable
                onPress={addReminder}
                accessibilityRole="button"
                style={{ alignSelf: "flex-start", backgroundColor: colors.aiAccentSoft, borderRadius: radius.xs, paddingHorizontal: 10, paddingVertical: 5 }}
              >
                <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodySemi, fontSize: 12 }}>Add workout reminder</Text>
              </Pressable>
            </Card>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
