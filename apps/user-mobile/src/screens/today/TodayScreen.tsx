import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealType } from "@fitness-ai-app/types";
import { Avatar } from "../../components/Avatar";
import { Icon, IconName } from "../../components/Icon";
import { ProgressRing } from "../../components/ProgressRing";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { useAuth } from "../../context/AuthContext";
import { fetchTodayMealLogs, fetchTodayWaterLogs, logWater } from "../../api/nutrition";
import { fetchCurrentMealPlan } from "../../api/mealPlans";
import { fetchWorkoutHistory } from "../../api/workoutSessions";
import { fetchNextWorkout } from "../../api/plans";
import { fetchGuardianReview } from "../../api/users";
import { fetchRecovery } from "../../api/recovery";
import { fetchReminders } from "../../api/reminders";
import { fetchNotifications } from "../../api/notifications";
import { fetchDueMedications, localDateString } from "../../api/medications";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = CompositeScreenProps<
  NativeStackScreenProps<TodayStackParamList, "TodayHome">,
  BottomTabScreenProps<MainTabsParamList>
>;

const WATER_GOAL_GLASSES = 8; // same placeholder as FuelScreen's own — see gap §25
const BRIEF_DISMISSED_KEY = "today.brief.dismissedOn";

function isToday(isoDate: string): boolean {
  return new Date(isoDate).toDateString() === new Date().toDateString();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

/** Next meal slot to show, by time of day (snack sits between lunch and dinner). */
function nextMealType(): MealType {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 17) return "snack";
  return "dinner";
}

const MEAL_LABEL: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

/**
 * Today / Home — restyled to Figma Today 01 (155:506). Everything shown is
 * real data: the daily brief is the active Plan's AI rationale (or a coach
 * prompt when none exists); the Readiness card only renders from real
 * GET /recovery data (never a fabricated score) and otherwise prompts the user
 * to log a check-in; the workout card keeps the in-progress-session > next
 * plan workout > plan complete priority from the earlier build; hydration
 * logging, per-query skeleton/error states and cross-tab deep links are
 * preserved. See git history for the U3/U7 notes on those behaviours.
 */
export function TodayScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data: guardianReview } = useQuery({ queryKey: ["users", "guardian-review"], queryFn: fetchGuardianReview, staleTime: 60_000 });
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const {
    data: waterLogs,
    isLoading: isWaterLoading,
    isError: isWaterError,
    refetch: refetchWater,
  } = useQuery({ queryKey: ["waterLogs", "today"], queryFn: fetchTodayWaterLogs });
  const {
    data: history,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory });
  const {
    data: nextWorkout,
    isLoading: isNextWorkoutLoading,
    isError: isNextWorkoutError,
    refetch: refetchNextWorkout,
  } = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout });
  const { data: recovery, isLoading: isRecoveryLoading } = useQuery({ queryKey: ["recovery"], queryFn: fetchRecovery });
  const { data: mealLogs } = useQuery({ queryKey: ["mealLogs", "today"], queryFn: fetchTodayMealLogs });
  const { data: mealPlan } = useQuery({ queryKey: ["mealPlan", "current"], queryFn: fetchCurrentMealPlan });
  const { data: reminders } = useQuery({ queryKey: ["reminders"], queryFn: fetchReminders });
  // Unread badge on the bell + next due medication. Both fail quietly: a
  // missing badge/row is better than an error card on the home screen.
  const { data: inbox, refetch: refetchInbox } = useQuery({
    queryKey: ["notifications", "badge"],
    queryFn: () => fetchNotifications({ filter: "unread", limit: 1 }),
  });
  const todayStr = localDateString();
  const { data: dueMeds, refetch: refetchDueMeds } = useQuery({
    queryKey: ["medications", "due", todayStr],
    queryFn: () => fetchDueMedications(todayStr),
  });
  useFocusEffect(
    useCallback(() => {
      refetchInbox();
      refetchDueMeds();
    }, [refetchInbox, refetchDueMeds]),
  );
  const nextMedication = useMemo(
    () =>
      (dueMeds?.items ?? [])
        .filter((d) => d.status === "pending" || d.status === "snoozed")
        .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0],
    [dueMeds],
  );
  const [isLoggingWater, setIsLoggingWater] = useState(false);
  const [briefDismissed, setBriefDismissed] = useState(true); // hidden until storage says otherwise (no flash)
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(BRIEF_DISMISSED_KEY)
      .then((v) => setBriefDismissed(v === new Date().toDateString()))
      .catch(() => setBriefDismissed(false));
  }, []);

  const dismissBrief = () => {
    setBriefDismissed(true);
    AsyncStorage.setItem(BRIEF_DISMISSED_KEY, new Date().toDateString()).catch(() => undefined);
  };

  // Either query feeds the same workout card, so either failing is one honest "couldn't load" state.
  const isPlanError = isHistoryError || isNextWorkoutError;
  const isPlanLoading = isHistoryLoading || isNextWorkoutLoading;
  const onRetryPlan = () => {
    if (isHistoryError) refetchHistory();
    if (isNextWorkoutError) refetchNextWorkout();
  };

  const totalGlasses = useMemo(() => (waterLogs ?? []).reduce((sum, w) => sum + w.glasses, 0), [waterLogs]);
  const inProgressToday = useMemo(
    () => (history ?? []).find((h) => h.status === "in_progress" && isToday(h.startedAt)),
    [history],
  );

  const mealType = nextMealType();
  const loggedToday = useMemo(() => {
    const logs = mealLogs ?? [];
    return { calories: logs.reduce((s, m) => s + m.calories, 0), protein: logs.reduce((s, m) => s + m.proteinG, 0), count: logs.length };
  }, [mealLogs]);
  // Assumes plan day 1 = the day the plan was generated (MealPlan has no explicit start date).
  const plannedMeal = useMemo(() => {
    if (!mealPlan || mealPlan.status !== "generated") return undefined;
    const daysSince = Math.floor((Date.now() - new Date(mealPlan.createdAt).getTime()) / 86_400_000);
    const day = (Math.max(0, daysSince) % Math.max(1, mealPlan.durationDays)) + 1;
    return mealPlan.items.find((i) => i.dayNumber === day && i.mealType === mealType);
  }, [mealPlan, mealType]);

  const nextReminder = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return (reminders ?? [])
      .filter((r) => r.isEnabled && r.daysOfWeek.includes(now.getDay()) && r.hour * 60 + r.minute >= nowMin)
      .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))[0];
  }, [reminders]);

  const onAddGlass = async () => {
    setIsLoggingWater(true);
    try {
      await logWater({ glasses: 1 });
      await queryClient.invalidateQueries({ queryKey: ["waterLogs", "today"] });
    } catch (err) {
      Alert.alert("Couldn't log water", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsLoggingWater(false);
    }
  };

  const fullName = user?.fullName ?? "";
  const firstName = fullName.split(" ")[0] || "there";
  const rationale = nextWorkout?.plan.rationale ?? null;
  const openCoach = () => navigation.navigate("Recover", { screen: "AiCoach" });
  const latest = recovery?.latest ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {rationale ? (
        <ReasoningSheet
          visible={whyOpen}
          onClose={() => setWhyOpen(false)}
          title="Why this workout?"
          heading="A suggestion, not a prescription"
          rationale={rationale}
          rows={nextWorkout?.workout ? [{ label: "Workout", value: `${nextWorkout.workout.name} · ${nextWorkout.plan.programName}` }] : []}
          generatedAt={nextWorkout?.plan.createdAt}
          action={
            nextWorkout?.workout
              ? {
                  label: "View workout",
                  onPress: () => navigation.navigate("Train", { screen: "WorkoutDetail", params: { workoutId: nextWorkout.workout!.id } }),
                }
              : undefined
          }
        />
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: "100%",
          maxWidth: layout.maxContentWidth,
          alignSelf: "center",
          paddingHorizontal: layout.screenPadding,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xl,
          gap: 20,
        }}
      >
        {guardianReview && guardianReview.status !== "approved" ? (
          <View
            accessibilityRole="alert"
            style={{ backgroundColor: colors.surface, borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 }}
          >
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>
              {guardianReview.status === "declined" ? "Guardian declined authorization" : "Guardian authorization pending"}
            </Text>
            <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13 }}>
              {guardianReview.status === "declined"
                ? "Personalized plans, health questions and analysis stay off. Contact support if this was a mistake."
                : "Personalized plans, health questions and analysis stay off until your guardian approves the request we emailed them."}
            </Text>
          </View>
        ) : null}

        {/* Header: avatar, greeting, search / schedule / notifications */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={fullName} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>{greeting()}</Text>
            <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 20 }} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <HeaderIcon icon="search" label="Search" onPress={() => navigation.navigate("Search")} />
          <HeaderIcon icon="calendar" label="Schedule" onPress={() => navigation.navigate("Schedule")} />
          <HeaderIcon
            icon="bell"
            label={inbox && inbox.unreadCount > 0 ? `Notifications, ${inbox.unreadCount} unread` : "Notifications"}
            badge={!!inbox && inbox.unreadCount > 0}
            onPress={() => navigation.navigate("Notifications")}
          />
        </View>

        {/* AI daily brief */}
        {!briefDismissed ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.aiAccent,
              borderRadius: radius.card,
              padding: 12,
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: colors.aiAccent, fontSize: 14 }}>✦</Text>
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14, letterSpacing: 0.5 }}>YOUR DAILY BRIEF</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }} numberOfLines={4}>
              {rationale ??
                "Ask 23Prime AI for training, nutrition, or recovery guidance grounded in your real progress."}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable onPress={openCoach} accessibilityRole="button" accessibilityLabel="View details in AI Coach" hitSlop={8}>
                <Text style={{ color: colors.aiAccent, ...typography.label, fontSize: 12 }}>View Details</Text>
              </Pressable>
              <Pressable onPress={dismissBrief} accessibilityRole="button" accessibilityLabel="Dismiss daily brief" hitSlop={8}>
                <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 12 }}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Readiness: only from real recovery data */}
        {isRecoveryLoading ? (
          <SkeletonCard lines={3} />
        ) : latest ? (
          <Pressable
            onPress={() => navigation.navigate("Recover", { screen: "Recovery" })}
            accessibilityRole="button"
            accessibilityLabel="Open recovery"
            style={cardStyle}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Recovery check-in</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  Self-reported · {new Date(latest.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
            {latest.energyLevel != null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <ProgressRing progress={latest.energyLevel / 5} size={72} strokeWidth={6} color={colors.aiAccent}>
                  <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{latest.energyLevel}/5</Text>
                </ProgressRing>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Energy</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 4 }}>
                    You rated your energy {latest.energyLevel} out of 5
                    {latest.soreness != null ? ` and soreness ${latest.soreness} out of 5` : ""}.
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {latest.sleepHours != null ? <StatChip icon="moon" label="Sleep" value={`${latest.sleepHours}h`} /> : null}
              {latest.hrvMs != null ? <StatChip icon="activity" label="HRV" value={`${latest.hrvMs}ms`} /> : null}
              {latest.restingHeartRate != null ? <StatChip icon="heart" label="Resting HR" value={`${latest.restingHeartRate}`} /> : null}
            </View>
          </Pressable>
        ) : (
          <View style={cardStyle}>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Readiness</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              Log how you slept and how you feel — or connect a device — and your recovery shows up here.
            </Text>
            <Pressable
              onPress={() => navigation.navigate("Recover", { screen: "Recovery" })}
              accessibilityRole="button"
              accessibilityLabel="Log recovery"
            >
              <Text style={{ color: theme.accent, ...typography.label, fontSize: 13 }}>Log recovery ›</Text>
            </Pressable>
          </View>
        )}

        {/* Today's workout */}
        {isPlanLoading ? (
          <SkeletonCard lines={3} />
        ) : isPlanError ? (
          <ErrorState message="Couldn't load your plan for today." onRetry={onRetryPlan} />
        ) : inProgressToday ? (
          <View style={cardStyle}>
            <Eyebrow color={theme.accent}>CONTINUE WORKOUT</Eyebrow>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>{inProgressToday.workoutName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {inProgressToday.programName} · {inProgressToday.totalSets} set{inProgressToday.totalSets === 1 ? "" : "s"} logged so far
            </Text>
            <PrimaryAction
              label="Resume session"
              onPress={() =>
                navigation.navigate("Train", {
                  screen: "ActiveWorkout",
                  params: { workoutId: inProgressToday.workoutId, sessionId: inProgressToday.id },
                })
              }
            />
          </View>
        ) : nextWorkout?.workout ? (
          <View style={cardStyle}>
            <Eyebrow color={theme.accent}>TODAY'S WORKOUT</Eyebrow>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>{nextWorkout.workout.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {nextWorkout.workout.durationMinutes} min · {nextWorkout.workout.intensity} · {nextWorkout.plan.programName}
            </Text>
            {rationale ? (
              <Pressable
                onPress={() => setWhyOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Why this workout?"
                style={{ flexDirection: "row", gap: 6 }}
              >
                <Text style={{ color: colors.aiAccent, fontSize: 12 }}>✦</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={2}>
                  {rationale}
                </Text>
                <Text style={{ color: colors.aiAccent, ...typography.label, fontSize: 12 }}>Why?</Text>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <PrimaryAction
                label="Start Workout"
                style={{ flex: 1 }}
                onPress={() =>
                  navigation.navigate("Train", { screen: "WorkoutDetail", params: { workoutId: nextWorkout.workout!.id } })
                }
              />
              <Pressable
                onPress={() =>
                  navigation.navigate("Train", { screen: "WorkoutDetail", params: { workoutId: nextWorkout.workout!.id } })
                }
                accessibilityRole="button"
                accessibilityLabel="View workout details"
              >
                <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 12 }}>View Details</Text>
              </Pressable>
            </View>
          </View>
        ) : nextWorkout?.programComplete ? (
          <View style={cardStyle}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>🎉 Plan complete</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              You've finished every workout in {nextWorkout.plan.programName}. Head to Train to explore more programs.
            </Text>
          </View>
        ) : null}

        {/* Upcoming meal */}
        <View style={cardStyle}>
          <Pressable
            onPress={() => navigation.navigate("Fuel", { screen: "FuelDashboard" })}
            accessibilityRole="button"
            accessibilityLabel="Open Fuel"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <View style={{ flex: 1 }}>
              <Eyebrow color={colors.success}>UPCOMING MEAL</Eyebrow>
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14, marginTop: 2 }}>
                What to eat next: {MEAL_LABEL[mealType]}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {loggedToday.count > 0
                  ? `${Math.round(loggedToday.calories)} kcal · ${Math.round(loggedToday.protein)}g protein logged today`
                  : "Nothing logged yet today"}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textSecondary} />
          </Pressable>
          {plannedMeal ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Text style={{ color: colors.aiAccent, fontSize: 12 }}>✦</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>From your meal plan: {plannedMeal.recipeName}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={() => navigation.navigate("Fuel", { screen: "LogMeal", params: { mealType } })}
              accessibilityRole="button"
              accessibilityLabel="Log meal"
            >
              <Text style={{ color: colors.success, ...typography.label, fontSize: 12 }}>Log Meal</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Fuel", { screen: "Recipes" })}
              accessibilityRole="button"
              accessibilityLabel="See recipes"
            >
              <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 12 }}>See Recipes</Text>
            </Pressable>
          </View>
        </View>

        {/* More for today */}
        <View style={{ ...cardStyle, padding: spacing.md, gap: 12 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>More for today</Text>

          {isWaterLoading ? (
            <SkeletonCard lines={1} />
          ) : isWaterError ? (
            <ErrorState message="Couldn't load today's hydration." onRetry={() => refetchWater()} />
          ) : (
            <View style={rowStyle}>
              <Icon name="droplet" size={22} color={colors.cyan} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Hydration</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {totalGlasses} / {WATER_GOAL_GLASSES} glasses logged
                </Text>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: theme.accent,
                      width: `${Math.min(100, (totalGlasses / WATER_GOAL_GLASSES) * 100)}%`,
                    }}
                  />
                </View>
              </View>
              <Pressable
                onPress={onAddGlass}
                disabled={isLoggingWater}
                accessibilityRole="button"
                accessibilityLabel="Add one glass of water"
                accessibilityState={{ disabled: isLoggingWater, busy: isLoggingWater }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.accent,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: isLoggingWater ? 0.5 : 1,
                }}
              >
                <Icon name="plus" size={16} color={theme.accent} />
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={() => navigation.navigate("Recover", { screen: "RecoverHub" })}
            accessibilityRole="button"
            accessibilityLabel="Open Recover"
            style={rowStyle}
          >
            <Icon name="heart-pulse" size={22} color={colors.aiAccent} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Recovery Routine</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16 }}>
                Log how you feel and see your recovery trends and routines.
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textSecondary} />
          </Pressable>

          {nextMedication ? (
            <Pressable
              onPress={() => navigation.navigate("More", { screen: "MedicineDue" })}
              accessibilityRole="button"
              accessibilityLabel="Medicine reminder due"
              style={rowStyle}
            >
              <Icon name="pill" size={22} color={colors.pink} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Next medicine</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {nextMedication.name} · {new Date(nextMedication.scheduledFor).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </Text>
              </View>
              <Text style={{ color: theme.accent, ...typography.label, fontSize: 12 }}>View</Text>
            </Pressable>
          ) : null}

          {nextReminder ? (
            <Pressable
              onPress={() => navigation.navigate("More", { screen: "Reminders" })}
              accessibilityRole="button"
              accessibilityLabel={`Reminder ${nextReminder.label}`}
              style={rowStyle}
            >
              <Icon name="bell" size={22} color={colors.warning} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>{nextReminder.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Reminder at {formatTime(nextReminder.hour, nextReminder.minute)}
                </Text>
              </View>
              <Text style={{ color: theme.accent, ...typography.label, fontSize: 12 }}>View</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const cardStyle = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.card,
  padding: 12,
  gap: 10,
} as const;

const rowStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  backgroundColor: colors.background,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.md,
  paddingHorizontal: 12,
  paddingVertical: 10,
} as const;

function Eyebrow({ color, children }: { color: string; children: string }) {
  return <Text style={{ color, fontSize: 12, letterSpacing: 1, fontFamily: fonts.bodySemi }}>{children}</Text>;
}

function PrimaryAction({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: { flex: number };
}) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        { height: 44, borderRadius: radius.md, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
        style,
      ]}
    >
      <Text style={{ color: theme.textOnAccent, ...typography.h3, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function StatChip({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: 6,
      }}
    >
      <Icon name={icon} size={16} color={colors.accent} />
      <View>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 12 }}>{value}</Text>
      </View>
    </View>
  );
}

function HeaderIcon({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={18} color={colors.textPrimary} />
      {badge ? (
        <View
          style={{
            position: "absolute",
            top: 6,
            right: 7,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.danger,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </Pressable>
  );
}
