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
import { MyAvatar } from "../../components/MyAvatar";
import { useRecoverProfilePhoto } from "../../lib/profilePhoto";
import { Icon } from "../../components/Icon";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { useAuth } from "../../context/AuthContext";
import { fetchTodayMealLogs, fetchTodayWaterLogs, logWater } from "../../api/nutrition";
import { fetchCurrentMealPlan } from "../../api/mealPlans";
import { fetchWorkoutHistory } from "../../api/workoutSessions";
import { fetchNextWorkout } from "../../api/plans";
import { fetchOnboardingProfile } from "../../api/users";
import { fetchReadiness } from "../../api/recovery";
import { fetchNotifications } from "../../api/notifications";
import { fetchCoachBookings } from "../../api/coachSessions";
import { fetchMeasurements, fetchProgressInsights } from "../../api/progress";
import { fetchWorkoutDetail } from "../../api/programs";
import { fetchDueMedications, fetchMedications, localDateString } from "../../api/medications";
import { useWorkoutSettings } from "../../api/workoutSettings";
import { fetchGymMe, GYM_ME_KEY } from "../../api/gym";
import { SetupChecklistCard, type SetupStep } from "../../components/SetupChecklistCard";
import { useToast } from "../../components/Toast";
import { extractErrorMessage } from "../../lib/apiError";
import { formatTimeOfDay } from "../../lib/format";
import { DAILY_TARGETS } from "../../lib/nutritionTargets";
import { WATER_GOAL_GLASSES, WATER_QUICK_ADD_GLASSES, ML_PER_GLASS, waterTotalText } from "../../lib/hydration";
import { useMeasureUnits } from "../../lib/measureUnits";
import { MEAL_LABEL as MED_MEAL_LABEL } from "../../lib/medicationReminder";
import { logDoseWithReminder, MEDICINE_SNOOZE_MINUTES } from "../../lib/medicationDoseActions";
import { fmtGymRange, gymDayShort } from "../../lib/gymFormat";
import { PARTNER_PROGRAMS_ENABLED } from "../../lib/partnerPrograms";
import { openNotificationDeepLink } from "../../lib/deepLink";
import { useDailyReview } from "../../lib/useDailyReview";
import { useDailyReviewStore } from "../../lib/dailyReviewStore";
import { activeLightWeek, shortDay } from "../../lib/dailySuggestions";
import { useOfflineSets } from "../../lib/offlineSets";
import { useTodayWorkoutTime } from "../../lib/workoutTime";
import { colors, elevation, fonts, layout, radius, spacing, typography, themed } from "../../theme/tokens";
import { Button } from "../../components/Button";
import { HeaderIconButton } from "../../components/HeaderIconButton";
import { Eyebrow } from "../../components/SectionHeader";
import { useTheme } from "../../theme/ThemeProvider";
import { useTodayWidgetSync } from "../../widget/useTodayWidgetSync";
import { TodayLoadingView, TodayOfflineView } from "./TodayStates";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = CompositeScreenProps<
  NativeStackScreenProps<TodayStackParamList, "TodayHome">,
  BottomTabScreenProps<MainTabsParamList>
>;

// The strength record the member tapped "Got it" on (exercise:kg), so its info card stays away.
const PROGRESS_SEEN_KEY = "today.progress.seen";
const PROGRESS_INFO_MAX_AGE_MS = 7 * 86_400_000;
const COACH_NOTE_MAX_AGE_MS = 7 * 86_400_000;

function isToday(isoDate: string): boolean {
  return new Date(isoDate).toDateString() === new Date().toDateString();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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

/** Date.getDay() order, matching WorkoutSettings.trainingDays keys. */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sorenessLabel(v: number): string {
  return v <= 2 ? "low" : v === 3 ? "moderate" : "high";
}

/** "SAT, 24 OCTOBER" (Figma today/01 date eyebrow). */
function dateEyebrow(d: Date): string {
  return `${d.toLocaleDateString("en-GB", { weekday: "short" })}, ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "long" })}`.toUpperCase();
}

/** "11:00 AM" today, "Tomorrow, 11:00 AM", else "Mon, 26 Oct · 11:00 AM". */
function sessionWhen(iso: string): string {
  const d = new Date(iso);
  const time = formatTimeOfDay(d);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === new Date().toDateString()) return time;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${time}`;
}

/** "7h 30m" from decimal hours. */
function sleepText(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

/** "6.6 kg down · 2.4 kg to go" for the weight goal row. */
function weightGoalText(g: { start: number; current: number; target: number }): string {
  const moved = g.current - g.start;
  const left = Math.abs(g.target - g.current);
  const leftText = left < 0.05 ? "goal reached" : `${left.toFixed(1)} kg to go`;
  return Math.abs(moved) < 0.05 ? leftText : `${Math.abs(moved).toFixed(1)} kg ${moved < 0 ? "down" : "up"} · ${leftText}`;
}

/** Main meals still ahead today, to split the protein left (a snack gets no share of its own). */
const MAIN_MEALS_LEFT: Record<MealType, number> = { breakfast: 3, lunch: 2, snack: 0, dinner: 1 };
const PROTEIN_AIM_MAX_G = 45;

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
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const net = useNetInfo();
  useRecoverProfilePhoto();
  // Keeps the Android home-screen widget (Figma widgets/02) in step with this screen.
  useTodayWidgetSync();
  const isOffline = net.isConnected === false;
  // Sets logged without a connection and not yet synced (Figma 08, lib/offlineSets.ts).
  const offlineSets = useOfflineSets();
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
  // Figma Today 10: once nothing is left to take today, confirm the latest dose taken.
  const lastTakenMedication = useMemo(
    () =>
      (dueMeds?.items ?? [])
        .filter((d) => d.status === "taken" && d.loggedAt)
        .sort((a, b) => (b.loggedAt as string).localeCompare(a.loggedAt as string))[0],
    [dueMeds],
  );
  const { data: medications } = useQuery({ queryKey: ["medications"], queryFn: fetchMedications, enabled: !!nextMedication });
  const nextMedicationDetail = medications?.find((m) => m.id === nextMedication?.medicationId);
  // Only a linked, active partner gym; 404 gym_not_linked simply hides the card.
  // Gym partners are hidden for now (lib/partnerPrograms.ts): no gym card or checklist step.
  const { data: gym } = useQuery({ queryKey: GYM_ME_KEY, queryFn: fetchGymMe, retry: false, enabled: PARTNER_PROGRAMS_ENABLED });
  const { data: workoutSettings } = useWorkoutSettings();
  // Figma today/01: the next action shows the member's own workout reminder time, and "Coming up" their next booked session.
  const workoutTime = useTodayWorkoutTime();
  const { data: bookings } = useQuery({ queryKey: ["coaching", "bookings"], queryFn: fetchCoachBookings, retry: false, staleTime: 60_000 });
  const nextSession = useMemo(
    () =>
      (bookings ?? [])
        .filter((x) => x.status === "confirmed" && new Date(x.scheduledAt).getTime() + x.durationMinutes * 60_000 > Date.now())
        .sort((p, q) => p.scheduledAt.localeCompare(q.scheduledAt))[0],
    [bookings],
  );
  const units = useMeasureUnits();
  const toast = useToast();
  // Figma 02b: one daily review card, only when a trigger fires (lib/dailySuggestions.ts).
  // It replaces the always-on optional mobility row (owner decision, 18 Oct 2026).
  const dailyReview = useDailyReview();
  // Info updates (Figma 02b today/02-info-updates, 24 Oct 2026): a lighter week the member said yes to,
  // and a new strength record from the Insights rule. Professional plan changes (C12) aren't in this build.
  const lightWeek = activeLightWeek(useDailyReviewStore().decisions, new Date());
  const { data: insights } = useQuery({ queryKey: ["progress", "insights"], queryFn: fetchProgressInsights, staleTime: 5 * 60_000 });
  const [progressSeen, setProgressSeen] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    AsyncStorage.getItem(PROGRESS_SEEN_KEY)
      .then((v) => setProgressSeen(v))
      .catch(() => setProgressSeen(null));
  }, []);
  const strength = insights?.cards.find((c) => c.kind === "strength")?.strength;
  const progressKey = strength ? `${strength.exerciseName}:${strength.toKg}` : null;
  const showProgress =
    !!strength && progressSeen !== undefined && progressSeen !== progressKey && Date.now() - new Date(strength.lastAt).getTime() <= PROGRESS_INFO_MAX_AGE_MS;
  const dismissProgress = () => {
    setProgressSeen(progressKey);
    if (progressKey) AsyncStorage.setItem(PROGRESS_SEEN_KEY, progressKey).catch(() => undefined);
  };
  const coachNote = useMemo(
    () =>
      (recentInbox?.items ?? []).find(
        (n) => n.kind === "coach" && Date.now() - new Date(n.createdAt).getTime() < COACH_NOTE_MAX_AGE_MS,
      ),
    [recentInbox],
  );
  const [isLoggingWater, setIsLoggingWater] = useState(false);
  const [whyWorkoutOpen, setWhyWorkoutOpen] = useState(false);

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
  // Figma Today 10: today's finished session replaces the "start" card.
  const completedToday = useMemo(
    () =>
      (history ?? [])
        .filter((h) => h.status === "completed" && h.completedAt && isToday(h.completedAt))
        .sort((a, b) => (b.completedAt as string).localeCompare(a.completedAt as string))[0],
    [history],
  );
  // Figma Today 11: a rest day is a day outside the user's own training days
  // (Workout settings, else onboarding). No days set means no rest-day claim.
  const trainingDays = workoutSettings?.trainingDays ?? [];
  const todayKey = DAY_KEYS[new Date().getDay()];
  const isRestDay = !inProgressToday && !completedToday && trainingDays.length > 0 && !trainingDays.includes(todayKey);
  const trainingDaysText = [...trainingDays]
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    .map((d) => gymDayShort(d))
    .join(", ");
  const holiday = gym?.announcement?.kind === "holiday" ? gym.announcement : null;
  const showGymCard = !!gym && gym.gym.active && (gym.today.closed || !!holiday || isRestDay);

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
    return { start, current, target, pct };
  }, [onboardingProfile, measurements]);

  const [medicationBusy, setMedicationBusy] = useState<"taken" | "snoozed" | null>(null);
  const onMedicationAction = async (status: "taken" | "snoozed") => {
    if (!nextMedication) return;
    setMedicationBusy(status);
    try {
      await logDoseWithReminder(nextMedication.medicationId, nextMedication.scheduledFor, status, nextMedicationDetail);
      await queryClient.invalidateQueries({ queryKey: ["medications"] });
      toast.show(status === "taken" ? "Marked as taken" : `Snoozed for ${MEDICINE_SNOOZE_MINUTES} minutes`, "success");
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't save this entry."), "error");
    } finally {
      setMedicationBusy(null);
    }
  };

  const onAddWater = async (glasses: number) => {
    setIsLoggingWater(true);
    try {
      await logWater({ glasses });
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
  const openRecovery = () => navigation.navigate("Recover", { screen: "Recovery", initial: false });
  const score = readiness?.score ?? null;
  const metrics = readiness?.metrics ?? null;
  const workoutPath = (workoutId: string) => () => navigation.navigate("Train", { screen: "WorkoutDetail", params: { workoutId }, initial: false });

  // Recovery context (Figma today/01): only the values the member's own log or device recorded.
  const recoveryLine = [
    metrics?.sleepHours != null ? `Sleep ${sleepText(metrics.sleepHours)}` : null,
    metrics?.hrvMs != null ? `HRV ${Math.round(metrics.hrvMs)} ms` : null,
    metrics?.restingHeartRate != null ? `Resting HR ${metrics.restingHeartRate} bpm` : null,
    metrics?.soreness != null ? `soreness ${sorenessLabel(metrics.soreness)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const mainMealsLeft = MAIN_MEALS_LEFT[mealType];
  const perMeal = mainMealsLeft > 0 ? Math.round(remaining.protein / mainMealsLeft) : 0;
  // Only a share one meal can sensibly cover; a bigger gap just shows what's left.
  const proteinAim = perMeal > 0 && perMeal <= PROTEIN_AIM_MAX_G ? perMeal : null;

  // "Matches today's readiness" is only claimed when a real score exists AND the
  // workout's intensity suits the band: ready -> any, moderate -> not advanced, rest -> none.
  const matchesReadiness = useMemo(() => {
    if (score == null || !nextWorkout?.workout || !readiness?.band) return false;
    if (readiness.band === "ready") return true;
    if (readiness.band === "moderate") return nextWorkout.workout.intensity !== "advanced";
    return false;
  }, [score, readiness?.band, nextWorkout?.workout]);


  // ---- Figma 08: offline ------------------------------------------------
  if (isOffline) {
    // Today's workout in progress can be resumed offline when both it and its session are saved on this phone.
    const resumable =
      inProgressToday &&
      queryClient.getQueryData(["workoutSession", inProgressToday.id]) &&
      queryClient.getQueryData(["workout", inProgressToday.workoutId])
        ? inProgressToday
        : null;
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
        waitingSets={offlineSets.waiting}
        resume={
          resumable
            ? {
                workoutName: resumable.workoutName,
                setsLogged: resumable.totalSets,
                onPress: () =>
                  navigation.navigate("Train", {
                    screen: "ActiveWorkout",
                    params: { workoutId: resumable.workoutId, sessionId: resumable.id },
                    initial: false,
                  }),
              }
            : null
        }
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

        {/* Header: avatar, greeting, round search + bell */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={() => navigation.navigate("More", { screen: "Profile", initial: false })}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            hitSlop={4}
          >
            <MyAvatar name={fullName} size={40} />
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 1.2 }}>{dateEyebrow(new Date())}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>{greeting()}</Text>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 20, letterSpacing: -0.5 }} numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <HeaderIconButton icon="search" label="Search" onPress={() => navigation.navigate("Search")} />
          <HeaderIconButton
            icon="bell"
            label={inbox && inbox.unreadCount > 0 ? `Notifications, ${inbox.unreadCount} unread` : "Notifications"}
            badge={!!inbox && inbox.unreadCount > 0}
            onPress={() => navigation.navigate("Notifications")}
          />
        </View>

        {/* Setup checklist (Figma today/00): until the required steps are done, or the member hides it */}
        <SetupChecklistCard
          profile={onboardingProfile}
          history={history}
          gym={gym}
          onOpen={(step: SetupStep) => {
            if (step === "workout") navigation.navigate("Train", { screen: "TrainDashboard" });
            else if (step === "goal") navigation.navigate("More", { screen: "MyGoals", initial: false });
            else if (step === "body") navigation.navigate("More", { screen: "EditProfile", initial: false });
            else if (step === "safety") navigation.navigate("More", { screen: "HealthSafety", initial: false });
            else if (step === "food") navigation.navigate("More", { screen: "FoodPreferences", initial: false });
            else if (step === "notifications") navigation.navigate("More", { screen: "NotificationPermission", initial: false });
            else navigation.navigate("More", { screen: "MyGym", initial: false });
          }}
        />

        {/* Daily review (Figma 02b today/01) */}
        {dailyReview.suggestions.length > 0 ? (
          <View style={{ ...cardStyle, borderColor: theme.accent }}>
            <Eyebrow color={theme.accentText}>✦ DAILY REVIEW · 1 MIN</Eyebrow>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>
              {dailyReview.suggestions.length === 1 ? "1 suggestion for today" : `${dailyReview.suggestions.length} suggestions for today`}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {dailyReview.suggestions.map((s) => s.title).join(" · ")}. Nothing changes unless you say yes.
            </Text>
            <PrimaryAction label="Review (1 min)" onPress={() => navigation.navigate("DailyReview")} />
          </View>
        ) : null}

        {/* Info updates (Figma 02b today/02-info-updates) */}
        {lightWeek ? (
          <View style={cardStyle}>
            <Eyebrow color={colors.textSecondary}>LIGHTER WEEK · INFO</Eyebrow>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>This is your lighter week</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {shortDay(lightWeek.start)} – {shortDay(lightWeek.end)}: use lighter weights or fewer sets, and stop well short of failure. Your
              plan is unchanged.
            </Text>
          </View>
        ) : null}
        {showProgress && strength ? (
          <View style={cardStyle}>
            <Eyebrow color={colors.successText}>PROGRESS · INFO</Eyebrow>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>
              {strength.exerciseName}: {units.wt(strength.fromKg)} → {units.wt(strength.toKg)} {units.wtUnit}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Your heaviest set went up across {strength.improvements} personal records in {strength.weeks} week{strength.weeks === 1 ? "" : "s"}. No
              action needed.
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable onPress={dismissProgress} accessibilityRole="button" accessibilityLabel="Got it, hide this update" hitSlop={8}>
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 13 }}>Got it</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("More", { screen: "ProgressSection", params: { screen: "ProgressInsights" }, initial: false })}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={{ color: theme.accentText, ...typography.label, fontSize: 13 }}>Insights ›</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Your next action (Figma today/01): today's workout, or where it stands */}
        {isPlanLoading ? (
          <SkeletonCard lines={3} />
        ) : isPlanError ? (
          <ErrorState message="Couldn't load your plan for today." onRetry={onRetryPlan} />
        ) : inProgressToday ? (
          <View style={nextActionStyle}>
            <Eyebrow color={theme.accentText}>YOUR NEXT ACTION · CONTINUE</Eyebrow>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>{inProgressToday.workoutName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {inProgressToday.programName} · {inProgressToday.totalSets} set{inProgressToday.totalSets === 1 ? "" : "s"} logged so far
            </Text>
            <PrimaryAction
              label="Resume session"
              onPress={() =>
                navigation.navigate("Train", {
                  screen: "ActiveWorkout",
                  params: { workoutId: inProgressToday.workoutId, sessionId: inProgressToday.id },
                  // Workouts home stays underneath, so Back, Finish and Discard also work when the tab was never opened.
                  initial: false,
                })
              }
            />
          </View>
        ) : completedToday ? (
          <View style={cardStyle}>
            <Eyebrow color={colors.successText}>WORKOUT COMPLETED</Eyebrow>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>{completedToday.workoutName}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {[
                completedToday.durationMinutes != null ? `${completedToday.durationMinutes} min` : null,
                completedToday.totalVolumeKg > 0
                  ? `${Math.round(units.wt(completedToday.totalVolumeKg)).toLocaleString()} ${units.wtUnit}`
                  : null,
                `finished ${formatTimeOfDay(new Date(completedToday.completedAt as string))}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Pressable
              onPress={() => navigation.navigate("Train", { screen: "WorkoutHistory", initial: false })}
              accessibilityRole="button"
              accessibilityLabel="View workout history"
              hitSlop={8}
            >
              <Text style={{ color: theme.accentText, ...typography.label, fontSize: 13 }}>View history ›</Text>
            </Pressable>
          </View>
        ) : isRestDay ? (
          <View style={cardStyle}>
            <Eyebrow color={theme.accentText}>REST DAY</Eyebrow>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>No workout planned today</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Your training days are {trainingDaysText}. A short walk or gentle yoga is optional.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Pressable
                onPress={() => navigation.navigate("Recover", { screen: "YogaLibrary", initial: false })}
                accessibilityRole="button"
                accessibilityLabel="Browse gentle yoga and mobility"
                hitSlop={8}
              >
                <Text style={{ color: theme.accentText, ...typography.label, fontSize: 13 }}>Gentle yoga ›</Text>
              </Pressable>
              {nextWorkout?.workout ? (
                <Pressable
                  onPress={workoutPath(nextWorkout.workout.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Train anyway: ${nextWorkout.workout.name}`}
                  hitSlop={8}
                >
                  <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 13 }}>Train anyway</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : nextWorkout?.workout ? (
          <View style={nextActionStyle}>
            <Pressable
              onPress={workoutPath(nextWorkout.workout.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open today's workout, ${nextWorkout.workout.name}`}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                {/* The time is the member's own workout reminder for today; plan workouts carry no clock time. */}
                <Eyebrow color={theme.accentText}>{workoutTime ? `YOUR NEXT ACTION · ${workoutTime}` : "YOUR NEXT ACTION"}</Eyebrow>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>{nextWorkout.workout.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {workoutDetail?.id === nextWorkout.workout.id && workoutDetail.exercises.length > 0
                    ? `${workoutDetail.exercises.length} exercise${workoutDetail.exercises.length === 1 ? "" : "s"} · ~${nextWorkout.workout.durationMinutes} min`
                    : `~${nextWorkout.workout.durationMinutes} min · ${capitalise(nextWorkout.workout.intensity)}`}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </Pressable>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              Your planned session from {nextWorkout.plan.programName} is ready.
            </Text>
            {gym && gym.gym.active ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                {gym.gym.name}
                {gym.location ? ` · ${gym.location.name}` : ""}
              </Text>
            ) : null}
            {matchesReadiness ? (
              <Pressable
                disabled={!rationale}
                onPress={() => setWhyWorkoutOpen(true)}
                accessibilityRole={rationale ? "button" : undefined}
                accessibilityLabel="Suits how recovered you are today"
                style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
              >
                <Text style={{ color: colors.aiText, fontSize: 13 }}>✦</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Suits how recovered you are today</Text>
                {rationale ? <Text style={{ color: colors.aiText, ...typography.label, fontSize: 13 }}>Why?</Text> : null}
              </Pressable>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <PrimaryAction label="Start Workout" style={{ flex: 1 }} onPress={workoutPath(nextWorkout.workout.id)} />
              <Pressable onPress={workoutPath(nextWorkout.workout.id)} accessibilityRole="button" accessibilityLabel="View workout details" hitSlop={8}>
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>View workout details</Text>
              </Pressable>
            </View>
          </View>
        ) : nextWorkout?.programComplete ? (
          <View style={cardStyle}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>🎉 Plan complete</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              You've finished every workout in {nextWorkout.plan.programName}. Head to Workouts to explore more programs.
            </Text>
          </View>
        ) : null}

        {/* My gym: only when today's hours or a holiday notice matter */}
        {showGymCard && gym ? (
          <Pressable
            onPress={() => navigation.navigate("More", { screen: "MyGym", initial: false })}
            accessibilityRole="button"
            accessibilityLabel={`My gym, ${gym.gym.name}`}
            style={cardStyle}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Eyebrow color={theme.accentText}>MY GYM</Eyebrow>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 15 }} numberOfLines={1}>
                  {gym.gym.name}
                  {gym.location ? ` · ${gym.location.name}` : ""}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Today ({gymDayShort(gym.today.day)})</Text>
              <Text style={{ color: gym.today.closed ? colors.warningText : colors.textPrimary, ...typography.label, fontSize: 13 }}>
                {gym.today.closed || (gym.today.opensAt && gym.today.closesAt)
                  ? fmtGymRange(gym.today.opensAt, gym.today.closesAt, gym.today.closed)
                  : "Hours not listed"}
              </Text>
            </View>
            {holiday ? (
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 13 }}>{holiday.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                  {holiday.body}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        {/* Daily reminders (Figma today/01): water, then the next medicine */}
        <View style={{ ...cardStyle, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Daily reminders</Text>
            <Pressable onPress={() => navigation.navigate("Schedule")} accessibilityRole="button" accessibilityLabel="View all of today's reminders" hitSlop={8}>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>View all</Text>
            </Pressable>
          </View>

          {isWaterLoading ? (
            <SkeletonCard lines={1} />
          ) : isWaterError ? (
            <ErrorState message="Couldn't load today's hydration." onRetry={() => refetchWater()} />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Icon name="droplet" size={24} color={theme.accent} fill={theme.accent} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>Water</Text>
                <Text style={{ color: totalGlasses >= WATER_GOAL_GLASSES ? colors.successText : colors.textSecondary, fontSize: 13 }}>
                  {totalGlasses >= WATER_GOAL_GLASSES
                    ? `${waterTotalText(totalGlasses, units.waterUnit)} logged · goal reached`
                    : `${waterTotalText(totalGlasses, units.waterUnit)} of ${waterTotalText(WATER_GOAL_GLASSES, units.waterUnit)} logged`}
                </Text>
              </View>
              <Pressable
                onPress={() => onAddWater(WATER_QUICK_ADD_GLASSES[0])}
                disabled={isLoggingWater}
                accessibilityRole="button"
                accessibilityLabel={`Add ${units.waterText(WATER_QUICK_ADD_GLASSES[0] * ML_PER_GLASS)} of water`}
                accessibilityState={{ disabled: isLoggingWater, busy: isLoggingWater }}
                hitSlop={6}
                style={{ ...chipStyle, backgroundColor: theme.accentSoft, borderColor: theme.accent, opacity: isLoggingWater ? 0.5 : 1 }}
              >
                <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                  +{units.waterText(WATER_QUICK_ADD_GLASSES[0] * ML_PER_GLASS)}
                </Text>
              </Pressable>
            </View>
          )}

          {nextMedication ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 24, alignItems: "center" }}>
                <Icon name="pill" size={16} color={theme.accent} />
              </View>
              <Pressable
                onPress={() =>
                  navigation.navigate("More", {
                    screen: "MedicineOccurrence",
                    initial: false,
                    params: { medicationId: nextMedication.medicationId, scheduledFor: nextMedication.scheduledFor },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`${nextMedication.name}, open reminder`}
                hitSlop={4}
                style={{ flex: 1, gap: 4 }}
              >
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }} numberOfLines={1}>
                  {nextMedication.name}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                  {nextMedication.status === "snoozed" && nextMedication.snoozedUntil
                    ? `Snoozed until ${formatTimeOfDay(new Date(nextMedication.snoozedUntil))}`
                    : [
                        formatTimeOfDay(new Date(nextMedication.scheduledFor)),
                        nextMedicationDetail?.mealTiming ? MED_MEAL_LABEL[nextMedicationDetail.mealTiming] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </Text>
              </Pressable>
              {/* Snoozing only makes sense once the reminder is due, and not twice in a row. */}
              {nextMedication.status === "pending" && new Date(nextMedication.scheduledFor).getTime() <= Date.now() ? (
                <Pressable
                  onPress={() => onMedicationAction("snoozed")}
                  disabled={medicationBusy != null}
                  accessibilityRole="button"
                  accessibilityLabel={`Snooze ${nextMedication.name} for ${MEDICINE_SNOOZE_MINUTES} minutes`}
                  accessibilityState={{ disabled: medicationBusy != null, busy: medicationBusy === "snoozed" }}
                  hitSlop={6}
                  style={{ ...chipStyle, opacity: medicationBusy != null ? 0.5 : 1 }}
                >
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>Snooze</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => onMedicationAction("taken")}
                disabled={medicationBusy != null}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${nextMedication.name} as taken`}
                accessibilityState={{ disabled: medicationBusy != null, busy: medicationBusy === "taken" }}
                hitSlop={6}
                style={{ ...chipStyle, borderColor: theme.accent, opacity: medicationBusy != null ? 0.5 : 1 }}
              >
                <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Mark taken</Text>
              </Pressable>
            </View>
          ) : lastTakenMedication ? (
            <Pressable
              onPress={() => navigation.navigate("More", { screen: "Reminders", initial: false })}
              accessibilityRole="button"
              accessibilityLabel={`${lastTakenMedication.name} taken. View all reminders`}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View style={{ width: 24, alignItems: "center" }}>
                <Icon name="pill" size={16} color={colors.success} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }} numberOfLines={1}>
                  {lastTakenMedication.name} taken · {formatTimeOfDay(new Date(lastTakenMedication.loggedAt as string))}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Nothing else due today.</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {/* Coming up (Figma today/01): the member's next booked session with a professional */}
        {nextSession ? (
          <Pressable
            onPress={() => navigation.navigate("More", { screen: "CoachSessions", initial: false })}
            accessibilityRole="button"
            accessibilityLabel={`Coming up: ${nextSession.offeringLabel}, ${sessionWhen(nextSession.scheduledAt)} with ${nextSession.professionalFullName}`}
            style={cardStyle}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Coming up</Text>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ width: 24, alignItems: "center" }}>
                <Icon name="calendar" size={16} color={theme.accent} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }} numberOfLines={1}>
                  {nextSession.offeringLabel}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                  {sessionWhen(nextSession.scheduledAt)} · {nextSession.professionalFullName}
                </Text>
              </View>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>View</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Upcoming meal */}
        <View style={cardStyle}>
          <Pressable
            onPress={() => navigation.navigate("Fuel", { screen: "FuelDashboard" })}
            accessibilityRole="button"
            accessibilityLabel="Open Food"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Eyebrow color={colors.successText}>UPCOMING MEAL</Eyebrow>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>What to eat next: {MEAL_LABEL[mealType]}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {remaining.protein > 0
                  ? `Protein ${remaining.protein} g left today${proteinAim ? ` · aim for ~${proteinAim} g at ${MEAL_LABEL[mealType].toLowerCase()}` : ""}`
                  : "You've reached today's protein target."}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textSecondary} />
          </Pressable>
          {plannedMeal ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {plannedMeal.recipeName} · about {Math.round(plannedMeal.proteinG)} g protein
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Pressable
              onPress={() => navigation.navigate("Fuel", { screen: "LogMeal", params: { mealType }, initial: false })}
              accessibilityRole="button"
              accessibilityLabel="Log meal"
              hitSlop={8}
            >
              <Text style={{ color: colors.successText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Log Meal</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Fuel", { screen: "Recipes", initial: false })}
              accessibilityRole="button"
              accessibilityLabel="See recipes"
              hitSlop={8}
            >
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>See Recipes</Text>
            </Pressable>
          </View>
        </View>

        {/* Recovery context (Figma today/01, 06): what the member's own logs or device say, as context */}
        {isReadinessLoading ? (
          <SkeletonCard lines={2} />
        ) : readiness?.source && readiness.score != null && recoveryLine ? (
          // Same freshness rule as the Recovery tab: the API only scores a log from today or yesterday.
          <Pressable onPress={openRecovery} accessibilityRole="button" accessibilityLabel={`Recovery context. ${recoveryLine}`} style={{ ...cardStyle, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Recovery context</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                  {readiness.source.kind === "device" ? readiness.source.name ?? "Connected device" : "Your own log"} ·{" "}
                  {formatTimeOfDay(new Date(readiness.source.at))}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{recoveryLine}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>Context for today. Your plan stays as it is.</Text>
            </View>
          </Pressable>
        ) : (
          <View style={cardStyle}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Recovery context</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              {readiness?.source && readiness.reason
                ? `${readiness.reason} Log how you slept and feel today, or connect a device.`
                : "Log how you slept and how you feel, or connect a device, and today's recovery shows up here."}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable onPress={openRecovery} accessibilityRole="button" accessibilityLabel="Log recovery" hitSlop={8}>
                <Text style={{ color: theme.accentText, ...typography.label, fontSize: 13 }}>Log recovery ›</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("Recover", { screen: "ConnectedDevices", initial: false })}
                accessibilityRole="button"
                accessibilityLabel="Connect a device"
                hitSlop={8}
              >
                <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 13 }}>Connect a device ›</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Later today (Figma today/06): a recent note from the member's coach and the weight goal */}
        {coachNote || weightGoal ? (
          <View style={{ ...cardStyle, padding: spacing.md, gap: 12 }}>
            <Pressable
              onPress={() => navigation.navigate("Schedule")}
              accessibilityRole="button"
              accessibilityLabel="Open today's schedule"
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Later today</Text>
              <Icon name="chevron-right" size={16} color={colors.textSecondary} />
            </Pressable>

            {coachNote ? (
              <Pressable
                onPress={() => {
                  if (!openNotificationDeepLink(navigation as unknown as NavigationProp<MainTabsParamList>, coachNote.deepLink)) {
                    navigation.navigate("Notifications");
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`${coachNote.title}. ${coachNote.body}`}
                style={{ ...laterItemStyle, borderLeftColor: colors.aiAccent }}
              >
                <Icon name="message" size={22} color={colors.aiAccent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }} numberOfLines={1}>
                    {coachNote.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={2}>
                    {coachNote.body}
                  </Text>
                </View>
                <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>View</Text>
              </Pressable>
            ) : null}

            {weightGoal ? (
              <View style={{ ...laterItemStyle, borderLeftColor: theme.accent }}>
                <Icon name="target" size={22} color={theme.accent} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>Weight Goal</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {weightGoal.current.toFixed(1)} → {weightGoal.target.toFixed(1)} kg
                  </Text>
                  <ProgressBar pct={weightGoal.pct} color={theme.accent} height={8} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, marginTop: 2 }}>
                    <Text style={{ flex: 1, color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }} numberOfLines={1}>
                      {weightGoalText(weightGoal)}
                    </Text>
                    <Pressable
                      onPress={() => navigation.navigate("More", { screen: "ProgressSection", params: { screen: "MeasurementHistory" }, initial: false })}
                      accessibilityRole="button"
                      accessibilityLabel="View weight goal details"
                      hitSlop={8}
                    >
                      <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>View Details ›</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// The app-wide card look (components/Card): 16 padding, card radius, soft shadow.
const cardStyle = themed(() => ({
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.card,
  padding: spacing.md,
  gap: 10,
  ...elevation.card,
} as const));

// Figma today/01 "Your next action": the one card with an accent edge.
const nextActionStyle = themed(() => ({
  backgroundColor: colors.surface,
  borderWidth: 1.5,
  borderColor: colors.accent,
  borderRadius: radius.card,
  padding: spacing.md,
  gap: 10,
  ...elevation.card,
} as const));

// Small outlined actions in the reminder rows (+250 ml, Mark taken).
const chipStyle = themed(() => ({
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  borderRadius: radius.sm,
  paddingHorizontal: 12,
  paddingVertical: 6,
  minHeight: 32,
  justifyContent: "center",
} as const));

// Figma today/06 "Later today" items: an inset row with a coloured left edge.
const laterItemStyle = themed(() => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  backgroundColor: colors.background,
  borderLeftWidth: 3,
  borderRadius: radius.md,
  paddingHorizontal: 12,
  paddingVertical: 10,
} as const));

function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
      <View style={{ height, borderRadius: height / 2, backgroundColor: color, width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </View>
  );
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
  return <Button label={label} onPress={onPress} size="compact" style={style} />;
}

