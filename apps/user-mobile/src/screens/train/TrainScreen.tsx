import React, { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import type { EquipmentContext, WorkoutPhase } from "@fitness-ai-app/types";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { HeaderIconButton } from "../../components/HeaderIconButton";
import { Eyebrow, SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { PARTNER_PROGRAMS_ENABLED } from "../../lib/partnerPrograms";
import { Icon, IconName } from "../../components/Icon";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { fetchProgramDetail, fetchPrograms, fetchWorkoutDetail } from "../../api/programs";
import { fetchMyPrograms } from "../../api/programPurchases";
import { fetchNextWorkout } from "../../api/plans";
import { fetchReadiness } from "../../api/recovery";
import { fetchPartner, PARTNER_KEY } from "../../api/partner";
import { fetchWorkoutHistory, startWorkoutSession } from "../../api/workoutSessions";
import { editOnboardingProfile, fetchOnboardingProfile } from "../../api/users";
import { extractErrorMessage } from "../../lib/apiError";
import { BRAND_NAME } from "../../lib/brand";
import { useDailyReview } from "../../lib/useDailyReview";
import { useTodayWorkoutTime } from "../../lib/workoutTime";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, themed } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";
import { ProgramsCatalog } from "./ProgramsMarketplaceScreen";

type Nav = NativeStackScreenProps<TrainStackParamList, "TrainDashboard">["navigation"];
type Tab = "today" | "programs" | "classes";

interface Props {
  navigation: Nav;
  initialTab?: Tab;
}

const PHASE_ROWS: Array<{ phase: WorkoutPhase; label: string; color: string }> = themed(() => ([
  { phase: "warmup", label: "Mobility & Warm-up", color: colors.successText },
  { phase: "main", label: "Strength Training", color: colors.accentText },
  { phase: "cooldown", label: "Cooldown & Stretch", color: colors.aiText },
]));

/** What each stored equipment context honestly means, shown under the Gym | Home toggle. */
const EQUIPMENT_LINE: Record<EquipmentContext, string> = {
  full_gym: "Barbells, Dumbbells, Cables, Machines",
  home_dumbbells_bands: "Dumbbells, Resistance bands",
  home_bodyweight_only: "Bodyweight only",
  none_travel: "No equipment (travel)",
};

const TOOLS: Array<{ label: string; icon: IconName; go: (n: Nav) => void }> = [
  { label: "Exercise Library", icon: "dumbbell", go: (n) => n.navigate("ExerciseLibrary") },
  { label: "My Programs", icon: "target", go: (n) => n.navigate("MyPrograms") },
  { label: "My Routines", icon: "target", go: (n) => n.navigate("Routines") },
  { label: "Reminders & Routines", icon: "bell", go: (n) => n.navigate("RemindersRoutines") },
  { label: "Analytics", icon: "trending-up", go: (n) => n.navigate("TrainingAnalytics") },
  { label: "Running", icon: "footprints", go: (n) => n.navigate("ActivityTracker", { kind: "run" }) },
  { label: "Cycling", icon: "activity", go: (n) => n.navigate("ActivityTracker", { kind: "ride" }) },
  { label: "Form Analysis", icon: "sparkles", go: (n) => n.navigate("FormAnalysis") },
  { label: "Workout Settings", icon: "settings", go: (n) => n.navigate("WorkoutSettings") },
];

/** Quick Start: the shortest session of each program the member can start now, up to this long. */
const QUICK_MAX_MINUTES = 30;
const QUICK_DOTS = themed(() => [colors.pink, colors.success, colors.accent]);

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function TabPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: selected ? theme.accent : colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ color: selected ? theme.accentText : colors.textSecondary, fontFamily: selected ? fonts.bodySemi : fonts.bodyMedium, fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The ✦ button that opens the AI coach (Figma train/01): purple-to-blue, like the AI accent. */
function AiCoachFab({ onPress }: { onPress: () => void }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ask ${BRAND_NAME} AI`}
      style={({ pressed }) => ({
        position: "absolute",
        right: spacing.md,
        bottom: spacing.md,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.9 : 1,
        shadowColor: colors.aiAccent,
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      })}
    >
      <Svg width={56} height={56} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="aiFab" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.aiAccent} />
            <Stop offset="1" stopColor={theme.accent} />
          </LinearGradient>
        </Defs>
        <Circle cx={28} cy={28} r={28} fill="url(#aiFab)" />
      </Svg>
      <Text style={{ color: "#ffffff", fontFamily: fonts.bodyBold, fontSize: 24 }}>✦</Text>
    </Pressable>
  );
}

/**
 * Train dashboard (Figma Train 01 "Training dashboard", and the shell for
 * Train 02's Programs tab). Tabs: Today / Programs / History (Classes is
 * hidden until classes exist).
 *
 * Real data only: "Today's workout" comes from the member's active plan
 * (`GET /plans/current/next-workout`), phases from the workout's own
 * exercises, a session already under way today from workout history, and
 * Active Programs from `GET /programs/mine`. The Gym | Home toggle persists
 * the onboarding `equipmentContext`. Classes has no backend feature yet, so
 * it is an honest "coming soon" state. History opens the Workout History
 * screen.
 *
 * 25 Oct 2026, owner: "build workout page like this" (Figma train/01):
 * "Training" header with a round settings button, outlined tab pills, Gym |
 * Home always shown, the "Suggested · in today's review" card (the first
 * daily-review suggestion; nothing changes unless the member says yes
 * there), the workout card with its phases and reminder time, Quick Start as
 * photo cards (the shortest session of each program the member can start
 * now, with that program's photo), Active Programs, and the ✦ AI coach
 * button.
 */
export function TrainScreen({ navigation, initialTab = "today" }: Props) {
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [whyOpen, setWhyOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const review = useDailyReview();
  const suggestion = review.suggestions[0] ?? null;
  const workoutTime = useTodayWorkoutTime();
  const tabsNav = navigation.getParent<NavigationProp<MainTabsParamList>>();

  const nextWorkout = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout });
  const readiness = useQuery({ queryKey: ["readiness"], queryFn: fetchReadiness });
  const profile = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile, staleTime: 60_000 });
  const myPrograms = useQuery({ queryKey: ["programs", "mine"], queryFn: fetchMyPrograms });
  const history = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory });
  const programs = useQuery({ queryKey: ["programs"], queryFn: fetchPrograms, staleTime: 10 * 60_000 });
  // Gym partners are hidden for now (lib/partnerPrograms.ts).
  const partner = useQuery({ queryKey: PARTNER_KEY, queryFn: fetchPartner, staleTime: 60_000, enabled: PARTNER_PROGRAMS_ENABLED });

  const todayWorkout = nextWorkout.data?.workout ?? null;
  const detail = useQuery({
    queryKey: ["workout", todayWorkout?.id],
    queryFn: () => fetchWorkoutDetail(todayWorkout!.id),
    enabled: !!todayWorkout,
  });

  // Quick Start: free or owned training programs with a photo; their workouts come from each program's detail.
  const ownedIds = new Set((myPrograms.data ?? []).map((m) => m.program.id));
  const startable = (programs.data ?? []).filter((p) => p.type !== "nutrition" && !!p.imageUrl && (p.priceCents === 0 || ownedIds.has(p.id)));
  const startableDetails = useQueries({
    queries: startable.map((p) => ({ queryKey: ["program", p.id], queryFn: () => fetchProgramDetail(p.id), staleTime: 10 * 60_000 })),
  });
  const quickStart = startable
    .map((p, i) => {
      const workouts = startableDetails[i]?.data?.workouts ?? [];
      const shortest = [...workouts].sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
      return shortest && shortest.durationMinutes <= QUICK_MAX_MINUTES ? { program: p, workout: shortest } : null;
    })
    .filter((q): q is NonNullable<typeof q> => q != null)
    .sort((a, b) => a.workout.durationMinutes - b.workout.durationMinutes)
    .slice(0, 6);

  const setEquipment = useMutation({
    mutationFn: (equipmentContext: EquipmentContext) => editOnboardingProfile({ equipmentContext }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["onboardingProfile"] }),
    onError: (err) => Alert.alert("Couldn't change training location", extractErrorMessage(err, "Try again in a moment.")),
  });

  const context = profile.data?.equipmentContext ?? null;
  const score = readiness.data?.score ?? null;
  const inProgress = (history.data ?? []).find((h) => h.status === "in_progress" && isToday(h.startedAt)) ?? null;

  const onStart = async () => {
    if (!todayWorkout) return;
    setIsStarting(true);
    try {
      const session = await startWorkoutSession(todayWorkout.id);
      navigation.navigate("ActiveWorkout", { workoutId: todayWorkout.id, sessionId: session.id });
    } catch (err) {
      Alert.alert("Couldn't start workout", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsStarting(false);
    }
  };

  const phaseCounts = (detail.data?.exercises ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.phase] = (acc[e.phase] ?? 0) + 1;
    return acc;
  }, {});
  const exerciseCount = detail.data?.exercises.length ?? null;

  const activePrograms = (myPrograms.data ?? []).filter((m) => m.status === "active").slice(0, 3);

  const whyRationale =
    nextWorkout.data?.plan.rationale ??
    readiness.data?.summary ??
    "This is the next workout in your active plan.";

  return (
    <View style={{ flex: 1 }}>
      <ScreenContainer
        title="Training"
        right={<HeaderIconButton icon="sliders" label="Workout settings" onPress={() => navigation.navigate("WorkoutSettings")} />}
      >
        <View style={{ flexDirection: "row", gap: 12 }} accessibilityRole="tablist">
          <TabPill label="Today" selected={tab === "today"} onPress={() => setTab("today")} />
          <TabPill label="Programs" selected={tab === "programs"} onPress={() => setTab("programs")} />
          <TabPill label="History" selected={false} onPress={() => navigation.navigate("WorkoutHistory")} />
        </View>

        {tab === "programs" ? <ProgramsCatalog /> : null}

        {/* The Classes tab is not shown (classes don't exist yet); this state is
            kept only so the feature can be switched back on in one place. */}
        {tab === "classes" ? (
          <EmptyState
            title="Classes are coming soon"
            subtitle="Live and on-demand classes aren't available in this version yet. Programs and your own routines are ready in the meantime."
            actionLabel="Browse Programs"
            onAction={() => setTab("programs")}
          />
        ) : null}

        {tab === "today" ? (
          <>
            {/* Gym | Home: where plans are built for (onboarding equipmentContext). */}
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {(
                  [
                    { label: "Gym", on: context === "full_gym", value: "full_gym" as EquipmentContext },
                    { label: "Home", on: context != null && context !== "full_gym", value: "home_dumbbells_bands" as EquipmentContext },
                  ] as const
                ).map((o) => (
                  <Pressable
                    key={o.label}
                    onPress={() => {
                      if (!o.on) setEquipment.mutate(o.value);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: o.on }}
                    accessibilityLabel={`${o.label} training`}
                    style={{
                      flex: 1,
                      height: 44,
                      borderRadius: radius.md,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: o.on ? theme.accent : colors.surface,
                      borderWidth: 1,
                      borderColor: o.on ? theme.accent : colors.border,
                    }}
                  >
                    <Text style={{ color: o.on ? theme.textOnAccent : colors.textSecondary, fontFamily: o.on ? fonts.bodySemi : fonts.bodyMedium, fontSize: 14 }}>
                      {o.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {context ? `Plans use: ${EQUIPMENT_LINE[context]}` : "Choose where you train, so plans use the right equipment."}
              </Text>
            </View>

            {/* Figma train/01 "Suggested · in today's review": the first daily-review suggestion, decided on Today. */}
            {suggestion ? (
              <Pressable
                onPress={() => tabsNav?.navigate("Today", { screen: "DailyReview", initial: false })}
                accessibilityRole="button"
                accessibilityLabel={`Suggested in today's review: ${suggestion.title}. ${suggestion.why}`}
              >
                <Card style={{ borderColor: colors.aiAccent, gap: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.5 }}>✦ SUGGESTED · IN TODAY'S REVIEW</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                    <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi }}>{suggestion.title}. </Text>
                    {suggestion.why} Changes only if you say yes.
                  </Text>
                </Card>
              </Pressable>
            ) : null}

            {/* A session already under way today comes first. */}
            {inProgress ? (
              <Card style={{ borderColor: theme.accent, borderWidth: 1.5, gap: spacing.sm }}>
                <Eyebrow color={theme.accentText}>In progress</Eyebrow>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>{inProgress.workoutName}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  {inProgress.programName} · {inProgress.totalSets} set{inProgress.totalSets === 1 ? "" : "s"} logged so far
                </Text>
                <Button
                  label="Resume workout"
                  size="compact"
                  onPress={() => navigation.navigate("ActiveWorkout", { workoutId: inProgress.workoutId, sessionId: inProgress.id })}
                  style={{ marginTop: spacing.xs }}
                />
              </Card>
            ) : null}

            {nextWorkout.isLoading ? (
              <SkeletonCard lines={4} />
            ) : nextWorkout.isError ? (
              <ErrorState message="Couldn't load today's workout." onRetry={() => nextWorkout.refetch()} />
            ) : todayWorkout && todayWorkout.id !== inProgress?.workoutId ? (
              <Card style={{ gap: 14 }}>
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm }}>
                    <Eyebrow color={theme.accentText}>Today's workout</Eyebrow>
                    {nextWorkout.data?.plan.programName ? (
                      <View
                        style={{
                          flexShrink: 1,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: colors.aiAccent,
                          backgroundColor: colors.aiAccentSoft,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: colors.aiText, fontSize: 13, fontFamily: fonts.bodySemi }} numberOfLines={1}>
                          {nextWorkout.data.plan.programName}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 20, marginTop: 2 }}>{todayWorkout.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {[
                      `~${todayWorkout.durationMinutes} min`,
                      exerciseCount != null ? `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}` : null,
                      workoutTime,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
                {PHASE_ROWS.some((r) => phaseCounts[r.phase]) ? (
                  <View style={{ gap: 10 }}>
                    {PHASE_ROWS.filter((r) => phaseCounts[r.phase]).map((r) => (
                      <View key={r.phase} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color }} />
                        <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 14 }}>{r.label}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                          {phaseCounts[r.phase]} exercise{phaseCounts[r.phase] === 1 ? "" : "s"}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Pressable onPress={() => setWhyOpen(true)} accessibilityRole="button" accessibilityLabel="Why this workout?" hitSlop={8} style={{ alignSelf: "flex-start" }}>
                  <Text style={{ color: colors.aiText, fontFamily: fonts.bodySemi, fontSize: 13 }}>✦ Why this workout?</Text>
                </Pressable>
                <Button label="Start Workout" size="compact" onPress={onStart} loading={isStarting} />
              </Card>
            ) : !inProgress ? (
              <Card style={{ gap: spacing.sm }}>
                <Eyebrow color={theme.accentText}>Today's workout</Eyebrow>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 18 }}>No workout planned today</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                  Start a program for a day-by-day plan, or pick a quick session below.
                </Text>
                <Button label="Browse programs" size="compact" onPress={() => setTab("programs")} style={{ marginTop: spacing.xs }} />
              </Card>
            ) : null}

            {PARTNER_PROGRAMS_ENABLED && partner.data ? (
              <Pressable onPress={() => navigation.navigate("GymWorkout")} accessibilityRole="button" accessibilityLabel="Today's gym workout">
                <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <Icon name="dumbbell" size={20} color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>Today's gym workout</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                      Checked against {partner.data.gym.name}'s equipment
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textSecondary} />
                </Card>
              </Pressable>
            ) : null}

            {quickStart.length > 0 ? (
              <>
                <SectionHeader title="Quick Start" />
                <View style={{ marginHorizontal: -spacing.md }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.md }}>
                    {quickStart.map((q, i) => (
                      <Pressable
                        key={q.workout.id}
                        onPress={() => navigation.navigate("WorkoutDetail", { workoutId: q.workout.id })}
                        accessibilityRole="button"
                        accessibilityLabel={`${q.program.name}, ${q.workout.name}, ${q.workout.durationMinutes} minutes`}
                        style={({ pressed }) => ({
                          width: 140,
                          backgroundColor: colors.surface,
                          borderRadius: radius.md,
                          borderWidth: 1,
                          borderColor: colors.border,
                          overflow: "hidden",
                          opacity: pressed ? 0.88 : 1,
                        })}
                      >
                        <Image source={{ uri: q.program.imageUrl as string }} style={{ width: "100%", height: 76, backgroundColor: colors.surfaceRaised }} resizeMode="cover" />
                        <View style={{ padding: 10, gap: 4 }}>
                          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 }} numberOfLines={1}>
                            {q.program.name}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: QUICK_DOTS[i % QUICK_DOTS.length] }} />
                            <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                              {q.workout.durationMinutes} min
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </>
            ) : null}

            <SectionHeader
              title="Active Programs"
              action={activePrograms.length > 0 ? { label: "See all", onPress: () => navigation.navigate("MyPrograms") } : undefined}
            />
            {myPrograms.isError ? (
              <ErrorState message="Couldn't load your programs." onRetry={() => myPrograms.refetch()} />
            ) : activePrograms.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {myPrograms.isLoading ? "Loading…" : "No active programs yet. Start one from the Programs tab."}
              </Text>
            ) : (
              activePrograms.map((m) => {
                const pct = m.totalWorkouts > 0 ? Math.round((m.completedWorkouts / m.totalWorkouts) * 100) : 0;
                return (
                  <Card key={m.program.id} style={{ gap: spacing.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 15 }} numberOfLines={1}>
                          {m.program.name}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                          {m.weekNumber ? `Week ${m.weekNumber} of ${m.program.durationWeeks} · ` : ""}
                          {m.completedWorkouts} of {m.totalWorkouts} workouts done
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => navigation.navigate("ProgramProgress", { programId: m.program.id })}
                        accessibilityRole="button"
                        accessibilityLabel={`Continue ${m.program.name}`}
                        hitSlop={6}
                        style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 9, opacity: pressed ? 0.88 : 1 })}
                      >
                        <Text style={{ color: theme.textOnAccent, fontFamily: fonts.bodyBold, fontSize: 13 }}>Continue</Text>
                      </Pressable>
                    </View>
                    <View style={{ gap: 6 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
                        <View style={{ height: "100%", width: `${pct}%`, borderRadius: 3, backgroundColor: theme.accent }} />
                      </View>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{pct}% completed</Text>
                    </View>
                  </Card>
                );
              })
            )}

            <SectionHeader title="Tools" />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TOOLS.map((t) => (
                <Pressable
                  key={t.label}
                  onPress={() => t.go(navigation)}
                  accessibilityRole="button"
                  accessibilityLabel={t.label}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Icon name={t.icon} size={14} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            {/* Room for the AI coach button so it never covers the last row. */}
            <View style={{ height: 64 }} />
          </>
        ) : null}

        <ReasoningSheet
          visible={whyOpen}
          onClose={() => setWhyOpen(false)}
          title="Why this workout?"
          rationale={whyRationale}
          rows={[
            ...(todayWorkout ? [{ label: "Workout", value: todayWorkout.name }] : []),
            ...(nextWorkout.data?.plan.programName ? [{ label: "Program", value: nextWorkout.data.plan.programName }] : []),
            { label: "Readiness", value: score != null ? `${score}/100 (${readiness.data?.basis ?? "Based on your logged data"})` : "No readiness score yet" },
          ]}
          generatedAt={nextWorkout.data?.plan.createdAt}
        />
      </ScreenContainer>
      <AiCoachFab onPress={() => tabsNav?.navigate("Recover", { screen: "AiCoach", initial: false })} />
    </View>
  );
}

/** The Programs Marketplace route opens the same tabbed screen on its Programs tab. */
export function ProgramsMarketplaceScreen({
  navigation,
}: NativeStackScreenProps<TrainStackParamList, "ProgramsMarketplace">) {
  return <TrainScreen navigation={navigation as unknown as Nav} initialTab="programs" />;
}
