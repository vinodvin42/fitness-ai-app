import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { useNetInfo } from "@react-native-community/netinfo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps, NavigationProp } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealType } from "@fitness-ai-app/types";
import { BRAND_NAME } from "../../lib/brand";
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
import { fetchGuardianReview, fetchOnboardingProfile } from "../../api/users";
import { fetchReadiness } from "../../api/recovery";
import { fetchNotifications } from "../../api/notifications";
import { fetchMeasurements } from "../../api/progress";
import { fetchWorkoutDetail } from "../../api/programs";
import { fetchDueMedications, localDateString } from "../../api/medications";
import { extractErrorMessage } from "../../lib/apiError";
import { formatTimeOfDay } from "../../lib/format";
import { DAILY_TARGETS } from "../../lib/nutritionTargets";
import { openNotificationDeepLink } from "../../lib/deepLink";
import { GUIDED_ROUTINES, routineSeconds } from "../../content/recover";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { TodayLoadingView, TodayOfflineView } from "./TodayStates";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = CompositeScreenProps<
  NativeStackScreenProps<TodayStackParamList, "TodayHome">,
  BottomTabScreenProps<MainTabsParamList>
>;

const WATER_GOAL_GLASSES = 8; // same placeholder as FuelScreen's own — see gap §25
const BRIEF_DISMISSED_KEY = "today.brief.dismissedOn";
/** The suggested mobility routine behind the Recovery Routine row (see content/recover.ts). */
const MOBILITY_ROUTINE_ID = "shoulder-hamstring-mobility";
const COACH_NOTE_MAX_AGE_MS = 7 * 86_400_000;

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

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sorenessLabel(v: number | null | undefined): string {
  if (v == null) return "—";
  return v <= 2 ? "Low" : v === 3 ? "Moderate" : "High";
}

/**
 * Today / Home — Figma "02 — Today" frames 01/06 (live), 07 (loading) and 08
 * (offline). Everything shown is real data: the readiness score comes from
 * GET /recovery/readiness (computed from the user's own recovery logs — null
 * with a prompt when there isn't enough), the daily brief is composed from
 * that score + the next planned workout + the protein target, the meal card
 * subtracts logged macros from the same daily targets Fuel uses, and the
 * "More for today" rows (medicine, coach feedback, weight goal) only render
 * when their data exists.
 */
export function TodayScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data: guardianReview } = useQuery({ queryKey: ["users", "guardian-review"], queryFn: fetchGuardianReview, staleTime: 60_000 });
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const net = useNetInfo();
  const isOffline = net.isConnected === false;
  const [retrying, setRetrying] = useState(false);

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
    dataUpdatedAt: nextWorkoutUpdatedAt,
    isLoading: isNextWorkoutLoading,
    isError: isNextWorkoutError,
    refetch: refetchNextWorkout,
  } = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout });
  const { data: readiness, isLoading: isReadinessLoading } = useQuery({ queryKey: ["readiness"], queryFn: fetchReadiness });
  const { data: mealLogs } = useQuery({ queryKey: ["mealLogs", "today"], queryFn: fetchTodayMealLogs });
  const { data: mealPlan } = useQuery({ queryKey: ["mealPlan", "current"], queryFn: fetchCurrentMealPlan });
  const { data: onboardingProfile } = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile, staleTime: 60_000 });
  const { data: measurements } = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements, staleTime: 60_000 });

  // Saves the next workout's full detail into the persisted query cache so the
  // offline view (Figma 08) can start it without a connection.
  const nextWorkoutId = nextWorkout?.workout?.id;
  const { data: workoutDetail, dataUpdatedAt: workoutDetailUpdatedAt } = useQuery({
    queryKey: ["workout", nextWorkoutId],
    queryFn: () => fetchWorkoutDetail(nextWorkoutId as string),
    enabled: !!nextWorkoutId,
  });

  // Unread badge on the bell, latest coach feedback + next due medication.
  // All fail quietly: a missing badge/row is better than an error card on the home screen.
  const { data: inbox, refetch: refetchInbox } = useQuery({
    queryKey: ["notifications", "badge"],
    queryFn: () => fetchNotifications({ filter: "unread", limit: 1 }),
  });
  const { data: recentInbox, refetch: refetchRecentInbox } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => fetchNotifications({ limit: 20 }),
  });
  const todayStr = localDateString();
  const { data: dueMeds, refetch: refetchDueMeds } = useQuery({
    queryKey: ["medications", "due", todayStr],
    queryFn: () => fetchDueMedications(todayStr),
  });
  useFocusEffect(
    useCallback(() => {
      if (isOffline) return;
      refetchInbox();
      refetchRecentInbox();
      refetchDueMeds();
    }, [isOffline, refetchInbox, refetchRecentInbox, refetchDueMeds]),
  );
  const nextMedication = useMemo(
    () =>
      (dueMeds?.items ?? [])
        .filter((d) => d.status === "pending" || d.status === "snoozed")
        .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0],
    [dueMeds],
  );
  const coachNote = useMemo(
    () =>
      (recentInbox?.items ?? []).find(
        (n) => n.kind === "coach" && Date.now() - new Date(n.createdAt).getTime() < COACH_NOTE_MAX_AGE_MS,
      ),
    [recentInbox],
  );
  const [isLoggingWater, setIsLoggingWater] = useState(false);
  const [briefDismissed, setBriefDismissed] = useState(true); // hidden until storage says otherwise (no flash)
  const [whyWorkoutOpen, setWhyWorkoutOpen] = useState(false);
  const [whyRoutineOpen, setWhyRoutineOpen] = useState(false);

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
  const remaining = useMemo(() => {
    const logs = mealLogs ?? [];
    const sum = (f: (m: (typeof logs)[number]) => number) => logs.reduce((s, m) => s + f(m), 0);
    return {
      protein: Math.max(0, Math.round(DAILY_TARGETS.proteinG - sum((m) => m.proteinG))),
      carbs: Math.max(0, Math.round(DAILY_TARGETS.carbsG - sum((m) => m.carbsG))),
      fat: Math.max(0, Math.round(DAILY_TARGETS.fatG - sum((m) => m.fatG))),
      count: logs.length,
    };
  }, [mealLogs]);
  // Assumes plan day 1 = the day the plan was generated (MealPlan has no explicit start date).
  const plannedMeal = useMemo(() => {
    if (!mealPlan || mealPlan.status !== "generated") return undefined;
    const daysSince = Math.floor((Date.now() - new Date(mealPlan.createdAt).getTime()) / 86_400_000);
    const day = (Math.max(0, daysSince) % Math.max(1, mealPlan.durationDays)) + 1;
    return mealPlan.items.find((i) => i.dayNumber === day && i.mealType === mealType);
  }, [mealPlan, mealType]);

  // Weight goal: current = newest logged weight (else the onboarding weight),
  // start = oldest logged weight (else onboarding weight). Hidden without a target.
  const weightGoal = useMemo(() => {
    const target = onboardingProfile?.targetWeightKg;
    if (target == null) return null;
    const logged = (measurements ?? [])
      .filter((m) => m.weightKg != null)
      .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
    const current = logged.length ? (logged[logged.length - 1].weightKg as number) : onboardingProfile?.weightKg ?? null;
    if (current == null) return null;
    const start = logged.length ? (logged[0].weightKg as number) : current;
    const span = Math.abs(start - target);
    const done = Math.abs(start - current);
    const movingRight = (target - start) * (current - start) >= 0;
    const pct = span < 0.05 ? 100 : movingRight ? Math.min(100, (done / span) * 100) : 0;
    return { current, target, pct };
  }, [onboardingProfile, measurements]);

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

  const onTryReconnect = async () => {
    setRetrying(true);
    try {
      await NetInfo.refresh();
      await queryClient.invalidateQueries();
    } finally {
      setRetrying(false);
    }
  };

  const fullName = user?.fullName ?? "";
  const firstName = fullName.split(" ")[0] || "there";
  const rationale = nextWorkout?.plan.rationale ?? null;
  const openCoach = () => navigation.navigate("Recover", { screen: "AiCoach" });
  const openRecovery = () => navigation.navigate("Recover", { screen: "Recovery" });
  const score = readiness?.score ?? null;
  const metrics = readiness?.metrics ?? null;
  const workoutPath = (workoutId: string) => () => navigation.navigate("Train", { screen: "WorkoutDetail", params: { workoutId } });

  // Daily brief assembled only from real values; falls back to the AI Coach prompt when there's nothing to say.
  const briefText = useMemo(() => {
    const parts: string[] = [];
    if (score != null) parts.push(`Readiness is ${score}/100 today.`);
    if (nextWorkout?.workout) parts.push(`${nextWorkout.workout.name} fits your plan.`);
    if (parts.length > 0) parts.push(`Aim for your ${DAILY_TARGETS.proteinG}g protein target.`);
    return parts.length > 0 ? parts.join(" ") : `Ask ${BRAND_NAME} AI for training, nutrition, or recovery guidance grounded in your real progress.`;
  }, [score, nextWorkout?.workout]);

  // "Matches today's readiness" is only claimed when a real score exists AND the
  // workout's intensity suits the band: ready -> any, moderate -> not advanced, rest -> none.
  const matchesReadiness = useMemo(() => {
    if (score == null || !nextWorkout?.workout || !readiness?.band) return false;
    if (readiness.band === "ready") return true;
    if (readiness.band === "moderate") return nextWorkout.workout.intensity !== "advanced";
    return false;
  }, [score, readiness?.band, nextWorkout?.workout]);

  const routine = GUIDED_ROUTINES.find((r) => r.id === MOBILITY_ROUTINE_ID);
  const routineMinutes = routine ? Math.max(1, Math.round(routineSeconds(routine) / 60)) : 10;

  // ---- Figma 08: offline ------------------------------------------------
  if (isOffline) {
    return (
      <TodayOfflineView
        greeting={greeting()}
        firstName={firstName}
        lastSyncedAt={nextWorkout ? nextWorkoutUpdatedAt : 0}
        workout={nextWorkout?.workout ?? null}
        detail={workoutDetail}
        savedAt={workoutDetailUpdatedAt}
        retrying={retrying}
        onRetry={onTryReconnect}
        onStart={() => {
          if (nextWorkout?.workout) workoutPath(nextWorkout.workout.id)();
        }}
      />
    );
  }

  // ---- Figma 07: initial load -------------------------------------------
  if ((isNextWorkoutLoading && !nextWorkout) || (isHistoryLoading && !history)) {
    return <TodayLoadingView greeting={greeting()} firstName={firstName} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      {rationale ? (
        <ReasoningSheet
          visible={whyWorkoutOpen}
          onClose={() => setWhyWorkoutOpen(false)}
          title="Why this workout?"
          heading="A suggestion, not a prescription"
          rationale={rationale}
          rows={nextWorkout?.workout ? [{ label: "Workout", value: `${nextWorkout.workout.name} · ${nextWorkout.plan.programName}` }] : []}
          generatedAt={nextWorkout?.plan.createdAt}
          action={
            nextWorkout?.workout
              ? { label: "View workout", onPress: workoutPath(nextWorkout.workout.id) }
              : undefined
          }
        />
      ) : null}
      <ReasoningSheet
        visible={whyRoutineOpen}
        onClose={() => setWhyRoutineOpen(false)}
        title="Why this routine?"
        heading="Optional, low-intensity movement"
        rationale={`Gentle mobility work is an easy way to keep your body moving between sessions. It's offered every day as an optional extra and isn't tailored to an injury or condition.${
          metrics?.soreness != null ? ` You logged soreness ${metrics.soreness}/5 for your latest check-in.` : ""
        }`}
        rows={routine ? [{ label: "Routine", value: `${routine.title} · ${routineMinutes} min` }] : []}
        action={{
          label: "Start routine",
          onPress: () => navigation.navigate("Recover", { screen: "GuidedSession", params: { routineId: MOBILITY_ROUTINE_ID } }),
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: "100%",
          maxWidth: layout.maxContentWidth,
          alignSelf: "center",
          paddingHorizontal: layout.screenPadding,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xl,
          gap: 16,
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

        {/* Header: avatar, greeting, round search + bell */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={fullName} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13 }}>{greeting()}</Text>
            <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 20 }} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <HeaderIcon icon="search" label="Search" onPress={() => navigation.navigate("Search")} />
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
              padding: 14,
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: colors.aiAccent, fontSize: 14 }}>✦</Text>
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14, letterSpacing: 0.5 }}>YOUR DAILY BRIEF</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }} numberOfLines={4}>
              ✦ {briefText}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable onPress={openCoach} accessibilityRole="button" accessibilityLabel="View details in AI Coach" hitSlop={8}>
                <Text style={{ color: colors.aiAccent, ...typography.label, fontSize: 12 }}>View Details</Text>
              </Pressable>
              <Pressable onPress={dismissBrief} accessibilityRole="button" accessibilityLabel="Dismiss daily brief" hitSlop={8}>
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 12 }}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Readiness: only from real, logged recovery data */}
        {isReadinessLoading ? (
          <SkeletonCard lines={3} />
        ) : score != null && readiness ? (
          <Pressable onPress={openRecovery} accessibilityRole="button" accessibilityLabel="Open recovery" style={cardStyle}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Readiness Score</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {readiness.source
                    ? `${readiness.source.kind === "device" ? readiness.source.name ?? "Connected device" : "Manual log"} · Updated ${formatTimeOfDay(new Date(readiness.source.at))}`
                    : "Manual log"}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <ProgressRing progress={score / 100} size={72} strokeWidth={6} color={colors.aiAccent}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>{score}</Text>
              </ProgressRing>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 15 }}>{readiness.headline}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{readiness.summary}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <StatChip icon="moon" label="Sleep" value={metrics?.sleepHours != null ? `${metrics.sleepHours}h` : "—"} />
              <StatChip icon="activity" label="HRV" value={metrics?.hrvMs != null ? `${metrics.hrvMs}ms` : "—"} tint={colors.success} />
              <StatChip icon="heart" label="Soreness" value={sorenessLabel(metrics?.soreness)} />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{readiness.basis}</Text>
          </Pressable>
        ) : (
          <View style={cardStyle}>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Readiness Score</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              {readiness?.source
                ? "Log a few more recovery metrics — sleep, energy, soreness, HRV or resting heart rate — and your score shows up here."
                : "Log how you slept and how you feel — or connect a device — and your readiness shows up here."}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable onPress={openRecovery} accessibilityRole="button" accessibilityLabel="Log recovery" hitSlop={8}>
                <Text style={{ color: theme.accent, ...typography.label, fontSize: 13 }}>Log recovery ›</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("Recover", { screen: "ConnectedDevices" })}
                accessibilityRole="button"
                accessibilityLabel="Connect a device"
                hitSlop={8}
              >
                <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 13 }}>Connect a device ›</Text>
              </Pressable>
            </View>
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
            <Pressable
              onPress={workoutPath(nextWorkout.workout.id)}
              accessibilityRole="button"
              accessibilityLabel="Open today's workout"
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Eyebrow color={theme.accent}>TODAY'S WORKOUT</Eyebrow>
                <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 17 }}>{nextWorkout.workout.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {nextWorkout.workout.durationMinutes} min · {capitalise(nextWorkout.workout.intensity)}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </Pressable>
            {matchesReadiness ? (
              <Pressable
                disabled={!rationale}
                onPress={() => setWhyWorkoutOpen(true)}
                accessibilityRole={rationale ? "button" : undefined}
                accessibilityLabel="Matches today's readiness"
                style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
              >
                <Text style={{ color: colors.aiAccent, fontSize: 12 }}>✦</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Matches today's readiness</Text>
                {rationale ? <Text style={{ color: colors.aiAccent, ...typography.label, fontSize: 12 }}>Why?</Text> : null}
              </Pressable>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <PrimaryAction label="Start Workout" style={{ flex: 1 }} onPress={workoutPath(nextWorkout.workout.id)} />
              <Pressable onPress={workoutPath(nextWorkout.workout.id)} accessibilityRole="button" accessibilityLabel="View workout details">
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 12 }}>View Details</Text>
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
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 15, marginTop: 2 }}>
                What to eat next: {MEAL_LABEL[mealType]}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Protein {remaining.protein}g remaining · Carbs {remaining.carbs}g · Fat {remaining.fat}g
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
              <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 12 }}>See Recipes</Text>
            </Pressable>
          </View>
        </View>

        {/* More for today */}
        <View style={{ ...cardStyle, padding: spacing.md, gap: 12 }}>
          <Pressable
            onPress={() => navigation.navigate("Schedule")}
            accessibilityRole="button"
            accessibilityLabel="Open schedule"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>More for today</Text>
            <Icon name="chevron-right" size={16} color={colors.textSecondary} />
          </Pressable>

          {isWaterLoading ? (
            <SkeletonCard lines={1} />
          ) : isWaterError ? (
            <ErrorState message="Couldn't load today's hydration." onRetry={() => refetchWater()} />
          ) : (
            <View style={rowStyle}>
              <Icon name="droplet" size={24} color={theme.accent} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Hydration</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {totalGlasses} / {WATER_GOAL_GLASSES} glasses logged
                </Text>
                <ProgressBar pct={(totalGlasses / WATER_GOAL_GLASSES) * 100} color={theme.accent} />
              </View>
              <Pressable
                onPress={onAddGlass}
                disabled={isLoggingWater}
                accessibilityRole="button"
                accessibilityLabel="Add one glass of water"
                accessibilityState={{ disabled: isLoggingWater, busy: isLoggingWater }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  borderWidth: 1,
                  borderColor: theme.accent,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: isLoggingWater ? 0.5 : 1,
                }}
              >
                <Icon name="plus" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
          )}

          <View style={rowStyle}>
            <Icon name="heart" size={24} color={theme.accent} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Recovery Routine</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                ✦ Optional: gentle mobility for {routineMinutes} min tonight. Skip any movement that feels uncomfortable.
              </Text>
            </View>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => navigation.navigate("Recover", { screen: "GuidedSession", params: { routineId: MOBILITY_ROUTINE_ID } })}
                accessibilityRole="button"
                accessibilityLabel="Accept the suggested mobility routine"
                style={{ borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentSoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: theme.accent, ...typography.label, fontSize: 12 }}>Accept</Text>
              </Pressable>
              <Pressable onPress={() => setWhyRoutineOpen(true)} accessibilityRole="button" accessibilityLabel="Why this routine?" hitSlop={8}>
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 12 }}>Why?</Text>
              </Pressable>
            </View>
          </View>

          {nextMedication ? (
            <View style={{ ...rowStyle, alignItems: "flex-start" }}>
              <Icon name="pill" size={22} color={colors.warning} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>{nextMedication.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Reminder at {formatTimeOfDay(new Date(nextMedication.scheduledFor))}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 }}>
                  <Pressable
                    onPress={() =>
                      navigation.navigate("More", {
                        screen: "MedicineOccurrence",
                        params: { medicationId: nextMedication.medicationId, scheduledFor: nextMedication.scheduledFor },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="View medicine reminder"
                    style={{ borderWidth: 1, borderColor: theme.accent, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 6 }}
                  >
                    <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 12 }}>View</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => navigation.navigate("More", { screen: "MedicationList" })}
                    accessibilityRole="button"
                    accessibilityLabel="View all reminders"
                    hitSlop={8}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>View all reminders →</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          {coachNote ? (
            <Pressable
              onPress={() => {
                if (!openNotificationDeepLink(navigation as unknown as NavigationProp<MainTabsParamList>, coachNote.deepLink)) {
                  navigation.navigate("Notifications");
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`${coachNote.title}. ${coachNote.body}`}
              style={rowStyle}
            >
              <Icon name="message" size={22} color={colors.aiAccent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }} numberOfLines={1}>
                  {coachNote.title}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {coachNote.body}
                </Text>
              </View>
              <Text style={{ color: theme.accent, ...typography.label, fontSize: 12 }}>View</Text>
            </Pressable>
          ) : null}

          {weightGoal ? (
            <View style={rowStyle}>
              <Icon name="target" size={22} color={theme.accent} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Weight Goal</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {weightGoal.current.toFixed(1)} → {weightGoal.target.toFixed(1)} kg
                </Text>
                <ProgressBar pct={weightGoal.pct} color={theme.accent} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                  <Text style={{ color: theme.accent, ...typography.label, fontSize: 11 }}>{weightGoal.pct.toFixed(1)}% of weight goal</Text>
                  <Pressable
                    onPress={() => navigation.navigate("More", { screen: "ProgressSection", params: { screen: "MeasurementHistory" } })}
                    accessibilityRole="button"
                    accessibilityLabel="View weight goal details"
                    hitSlop={8}
                  >
                    <Text style={{ color: theme.accent, ...typography.label, fontSize: 11 }}>View Details ›</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.card,
  padding: 14,
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

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: color, width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </View>
  );
}

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

function StatChip({ icon, label, value, tint }: { icon: IconName; label: string; value: string; tint?: string }) {
  const { colors: theme } = useTheme();
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
        padding: 8,
      }}
    >
      <Icon name={icon} size={16} color={tint ?? theme.accent} />
      <View>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{label}</Text>
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
        width: 38,
        height: 38,
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
