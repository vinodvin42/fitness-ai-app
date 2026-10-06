import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EquipmentContext, WorkoutPhase } from "@fitness-ai-app/types";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Icon, IconName } from "../../components/Icon";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { fetchTrendingWorkout, fetchWorkoutDetail } from "../../api/programs";
import { fetchMyPrograms } from "../../api/programPurchases";
import { fetchNextWorkout } from "../../api/plans";
import { fetchReadiness } from "../../api/recovery";
import { startWorkoutSession } from "../../api/workoutSessions";
import { editOnboardingProfile, fetchOnboardingProfile } from "../../api/users";
import { extractErrorMessage } from "../../lib/apiError";
import { BRAND_NAME } from "../../lib/brand";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";
import { ProgramsCatalog } from "./ProgramsMarketplaceScreen";

type Nav = NativeStackScreenProps<TrainStackParamList, "TrainDashboard">["navigation"];
type Tab = "today" | "programs" | "classes";

interface Props {
  navigation: Nav;
  initialTab?: Tab;
}

const PHASE_ROWS: Array<{ phase: WorkoutPhase; label: string; color: string }> = [
  { phase: "warmup", label: "Mobility & Warm-up", color: colors.success },
  { phase: "main", label: "Strength Training", color: colors.accent },
  { phase: "cooldown", label: "Cooldown & Stretch", color: colors.aiAccent },
];

const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;

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

function TabPill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 38,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: selected ? theme.accent : colors.border,
        backgroundColor: selected ? theme.accentSoft : colors.surface,
      }}
    >
      <Text style={{ color: selected ? theme.accent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function SmallAction({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: primary ? theme.accent : colors.border,
        backgroundColor: primary ? colors.aiAccentSoft : colors.surfaceRaised,
      }}
    >
      <Text style={{ color: primary ? colors.aiAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Train dashboard (Figma Train 01 "Training dashboard", and the shell for
 * Train 02's Programs tab). Tabs: Today / Programs / Classes / History.
 *
 * Real data only: the recommendation + "Today's workout" cards come from the
 * user's active plan (`GET /plans/current/next-workout`), the readiness score
 * from `GET /recovery/readiness` (omitted from the sentence when there isn't
 * one), phases from the workout's own exercises, Quick Start from real
 * destinations (trending workout, routines, run/ride trackers) and Active
 * Programs from `GET /programs/mine`. The Gym | Home toggle persists the
 * onboarding `equipmentContext`. Classes has no backend feature yet, so it is
 * an honest "coming soon" state. History opens the Workout History screen.
 */
export function TrainScreen({ navigation, initialTab = "today" }: Props) {
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [whyOpen, setWhyOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const nextWorkout = useQuery({ queryKey: ["plans", "current", "nextWorkout"], queryFn: fetchNextWorkout });
  const readiness = useQuery({ queryKey: ["readiness"], queryFn: fetchReadiness });
  const profile = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile, staleTime: 60_000 });
  const myPrograms = useQuery({ queryKey: ["programs", "mine"], queryFn: fetchMyPrograms });
  const trending = useQuery({ queryKey: ["trending", "workout"], queryFn: fetchTrendingWorkout, staleTime: 5 * 60_000 });

  const todayWorkout = nextWorkout.data?.workout ?? null;
  const detail = useQuery({
    queryKey: ["workout", todayWorkout?.id],
    queryFn: () => fetchWorkoutDetail(todayWorkout!.id),
    enabled: !!todayWorkout,
  });

  const setEquipment = useMutation({
    mutationFn: (equipmentContext: EquipmentContext) => editOnboardingProfile({ equipmentContext }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["onboardingProfile"] }),
    onError: (err) => Alert.alert("Couldn't change training location", extractErrorMessage(err, "Try again in a moment.")),
  });

  const context = profile.data?.equipmentContext ?? null;
  const isGym = context === "full_gym";
  const score = readiness.data?.score ?? null;

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

  const quickStart: Array<{ key: string; title: string; meta: string; icon: IconName; image?: string | null; tint: string; onPress: () => void }> = [];
  if (trending.data?.workout) {
    const w = trending.data.workout;
    quickStart.push({
      key: "trending",
      title: w.name,
      meta: `${w.durationMinutes} min`,
      icon: "flame",
      image: w.imageUrl,
      tint: colors.orange,
      onPress: () => navigation.navigate("WorkoutDetail", { workoutId: w.id }),
    });
  }
  quickStart.push(
    { key: "routines", title: "My Routines", meta: "Your saved lists", icon: "target", tint: theme.accent, onPress: () => navigation.navigate("Routines") },
    { key: "run", title: "Run", meta: "Timer & GPS log", icon: "footprints", tint: colors.success, onPress: () => navigation.navigate("ActivityTracker", { kind: "run" }) },
    { key: "ride", title: "Ride", meta: "Timer & GPS log", icon: "activity", tint: colors.cyan, onPress: () => navigation.navigate("ActivityTracker", { kind: "ride" }) },
  );

  const whyRationale =
    nextWorkout.data?.plan.rationale ??
    readiness.data?.summary ??
    "This is the next workout in your active plan.";

  return (
    <ScreenContainer
      title="Training"
      right={
        <Pressable
          onPress={() => navigation.navigate("WorkoutSettings")}
          accessibilityRole="button"
          accessibilityLabel="Workout settings"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="settings" size={18} color={colors.textSecondary} />
        </Pressable>
      }
    >
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="tablist">
        <TabPill label="Today" selected={tab === "today"} onPress={() => setTab("today")} />
        <TabPill label="Programs" selected={tab === "programs"} onPress={() => setTab("programs")} />
        <TabPill label="Classes" selected={tab === "classes"} onPress={() => setTab("classes")} />
        <TabPill label="History" selected={false} onPress={() => navigation.navigate("WorkoutHistory")} />
      </View>

      {tab === "programs" ? <ProgramsCatalog navigation={navigation as unknown as NativeStackNavigationProp<TrainStackParamList>} /> : null}

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
          {context ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(
                  [
                    { label: "Gym", on: isGym, value: "full_gym" as EquipmentContext },
                    { label: "Home", on: !isGym, value: "home_dumbbells_bands" as EquipmentContext },
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
                      height: 42,
                      borderRadius: radius.sm,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                      backgroundColor: o.on ? theme.accent : colors.surface,
                      borderWidth: 1,
                      borderColor: o.on ? theme.accent : colors.border,
                    }}
                  >
                    <Icon name={o.label === "Gym" ? "dumbbell" : "home"} size={15} color={o.on ? theme.textOnAccent : colors.textSecondary} />
                    <Text style={{ color: o.on ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>Equipment: {EQUIPMENT_LINE[context]}</Text>
            </View>
          ) : null}

          {nextWorkout.isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : todayWorkout ? (
            <>
              <View
                style={{
                  backgroundColor: colors.aiSurface,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.aiBorder,
                  padding: spacing.md,
                  gap: spacing.sm,
                }}
              >
                <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6 }}>
                  ✦ {BRAND_NAME.toUpperCase()} RECOMMENDATION
                </Text>
                <Text style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 19 }}>
                  {score != null
                    ? `${BRAND_NAME} recommends ${todayWorkout.name} today — your readiness is ${score}/100.`
                    : `${BRAND_NAME} recommends ${todayWorkout.name} today — it's next in your plan. Log how you slept and feel to see a readiness score.`}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <SmallAction label="Accept" primary onPress={() => navigation.navigate("WorkoutDetail", { workoutId: todayWorkout.id })} />
                  <SmallAction label="Adjust" onPress={() => setTab("programs")} />
                  <SmallAction label="Why?" onPress={() => setWhyOpen(true)} />
                </View>
              </View>

              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: radius.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.md,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: theme.accent, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6 }}>TODAY'S WORKOUT</Text>
                  {nextWorkout.data?.plan.programName ? (
                    <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.aiBorder, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: colors.aiAccent, fontSize: 10, fontFamily: fonts.bodySemi }} numberOfLines={1}>
                        {nextWorkout.data.plan.programName}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22, marginTop: 6 }}>{todayWorkout.name}</Text>
                <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
                  {todayWorkout.durationMinutes} min
                  {exerciseCount != null ? ` · ${exerciseCount} exercises` : ""} ·{" "}
                  {LEVEL_LABEL[todayWorkout.intensity as keyof typeof LEVEL_LABEL] ?? todayWorkout.intensity}
                </Text>
                <View style={{ gap: 10, marginTop: spacing.md }}>
                  {PHASE_ROWS.filter((r) => phaseCounts[r.phase]).map((r) => (
                    <View key={r.phase} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color }} />
                      <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>{r.label}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{phaseCounts[r.phase]} ex</Text>
                    </View>
                  ))}
                </View>
                <Button label="Start Workout" onPress={onStart} loading={isStarting} style={{ marginTop: spacing.md }} />
              </View>
            </>
          ) : (
            <EmptyState
              title="No workout planned for today"
              subtitle="Pick a program to get a day-by-day plan, or start from Quick Start below."
              actionLabel="Browse Programs"
              onAction={() => setTab("programs")}
            />
          )}

          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Quick Start</Text>
          <View style={{ marginHorizontal: -spacing.md }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.md }}>
              {quickStart.map((q) => (
                <Pressable
                  key={q.key}
                  onPress={q.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={`${q.title}, ${q.meta}`}
                  style={{
                    width: 140,
                    backgroundColor: colors.surface,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                  }}
                >
                  {q.image ? (
                    <Image source={{ uri: q.image }} style={{ width: "100%", height: 84, backgroundColor: colors.surfaceRaised }} resizeMode="cover" />
                  ) : (
                    <View style={{ height: 84, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={q.icon} size={26} color={q.tint} />
                    </View>
                  )}
                  <View style={{ padding: 10 }}>
                    <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 13 }} numberOfLines={1}>
                      {q.title}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: q.tint }} />
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{q.meta}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Active Programs</Text>
          {activePrograms.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {myPrograms.isLoading ? "Loading…" : "No active programs yet. Start one from the Programs tab."}
            </Text>
          ) : (
            activePrograms.map((m) => {
              const pct = m.totalWorkouts > 0 ? Math.round((m.completedWorkouts / m.totalWorkouts) * 100) : 0;
              return (
                <View
                  key={m.program.id}
                  style={{
                    backgroundColor: colors.surface,
                    borderRadius: radius.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: spacing.md,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, ...typography.h3 }} numberOfLines={1}>
                        {m.program.name}
                      </Text>
                      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                        {m.completedWorkouts} of {m.totalWorkouts} workouts done
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => navigation.navigate("ProgramProgress", { programId: m.program.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Continue ${m.program.name}`}
                      style={{ backgroundColor: theme.accent, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 8 }}
                    >
                      <Text style={{ color: theme.textOnAccent, fontFamily: fonts.bodyBold, fontSize: 12 }}>Continue</Text>
                    </Pressable>
                  </View>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden", marginTop: spacing.sm }}>
                    <View style={{ height: "100%", width: `${pct}%`, backgroundColor: theme.accent }} />
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{pct}% completed</Text>
                </View>
              );
            })
          )}

          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>More</Text>
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
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
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
  );
}

/** The Programs Marketplace route opens the same tabbed screen on its Programs tab. */
export function ProgramsMarketplaceScreen({
  navigation,
}: NativeStackScreenProps<TrainStackParamList, "ProgramsMarketplace">) {
  return <TrainScreen navigation={navigation as unknown as Nav} initialTab="programs" />;
}
