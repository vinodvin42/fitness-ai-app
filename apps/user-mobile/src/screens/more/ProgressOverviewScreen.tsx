import React from "react";
import { r1Flags } from "@fitness-ai-app/config";
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon, type IconName } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { ProgressRing } from "../../components/ProgressRing";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { WeightGoalChart } from "../../components/ProgressCharts";
import { fetchCheckInStatus, fetchMeasurements, fetchProgressOverview, fetchProgressPhotos } from "../../api/progress";
import { fetchHealthspan, HEALTHSPAN_KEY } from "../../api/healthspan";
import { useMeasureUnits } from "../../lib/measureUnits";
import { fieldChange, pickArms, pickThighs } from "../../lib/measurementFields";
import { colors, fonts, layout, radius, spacing, themed, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "Progress">;

function sinceLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function progressHeadline(percent: number): string {
  if (percent >= 100) return "Goal reached!";
  if (percent >= 90) return "Almost there!";
  if (percent >= 50) return "Past the halfway mark";
  if (percent >= 10) return "Building momentum";
  return "Just getting started";
}

interface Row {
  key: string;
  icon: IconName;
  tint: string;
  tintSoft: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

/** A titled group of rows in one card, divided by hairlines (the More screen's pattern). */
function RowGroup({ rows }: { rows: Row[] }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {rows.map((r, i) => (
        <Pressable
          key={r.key}
          onPress={r.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${r.title}. ${r.subtitle}`}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingHorizontal: spacing.md,
            paddingVertical: 14,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
            backgroundColor: pressed ? colors.surfaceRaised : "transparent",
          })}
        >
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: r.tintSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name={r.icon} size={19} color={r.tint} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{r.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={2}>
              {r.subtitle}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

/** Small "log something" shortcut at the top of the screen. */
function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        height: 40,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceRaised : colors.surface,
      })}
    >
      <Icon name={icon} size={16} color={theme.accentText} />
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const ACTIVITY_SOFT = themed(() => ({ orangeSoft: "rgba(251,146,60,0.16)" }));

/**
 * Progress overview (Figma Progress 01). Everything shown is computed from the
 * user's own logs: Overall Progress % = (start - current) / (start - goal)
 * with start = first weight ever logged and goal = the target weight set in
 * Edit Profile (no goal => the card has no ring and offers "Set a goal
 * weight"). Measurement tiles show the latest value per field and its change
 * versus the previous logged value of that field. Personal Records are the
 * heaviest logged sets, tagged with their source ("Workout log").
 *
 * 25 Oct 2026 (owner: "arrange everything in progress in a professional way"):
 * one order that reads top to bottom. Quick log actions first; then Goal,
 * Body (weight, measurements, composition), Strength (personal records),
 * Photos, Habits (check-in, activity calendar) and Reports (insights,
 * progress review, decision history, life timeline), each under the app's
 * one section-title style, with related links grouped into single cards.
 */
export function ProgressOverviewScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { colors: theme } = useTheme();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const overview = useQuery({ queryKey: ["progress", "overview"], queryFn: fetchProgressOverview });
  const measurements = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });
  const photos = useQuery({ queryKey: ["progressPhotos"], queryFn: fetchProgressPhotos });
  const { data: checkInStatus } = useQuery({ queryKey: ["checkIns", "status"], queryFn: fetchCheckInStatus });
  const { data: healthspan } = useQuery({ queryKey: HEALTHSPAN_KEY, queryFn: fetchHealthspan });

  const parent = navigation.getParent<NavigationProp<MoreStackParamList>>();
  const onBack = () => navigation.goBack();

  if (overview.isError) {
    return (
      <ScreenContainer title="Progress" onBack={onBack}>
        <ErrorState onRetry={() => overview.refetch()} />
      </ScreenContainer>
    );
  }
  if (overview.isLoading || !overview.data) {
    return (
      <ScreenContainer title="Progress" onBack={onBack}>
        <SkeletonCard lines={4} />
      </ScreenContainer>
    );
  }

  const { weightHistory, personalRecords, goal } = overview.data;
  const rows = measurements.data ?? [];
  const wt = (kg: number) => `${units.wt(kg).toFixed(1)} ${units.wtUnit}`;

  const tiles = [
    { label: "Chest", change: fieldChange(rows, (m) => m.chestCm) },
    { label: "Waist", change: fieldChange(rows, (m) => m.waistCm) },
    { label: "Arms", change: fieldChange(rows, pickArms) },
    { label: "Thighs", change: fieldChange(rows, pickThighs) },
  ].filter((t) => t.change.latest);

  const dailyDone = checkInStatus?.daily.submitted ?? false;
  const weeklyDone = checkInStatus?.weekly.submitted ?? false;
  const photoCount = photos.data?.length ?? 0;
  const latestPhoto = photos.data?.[0] ?? null;
  const chartPoints = weightHistory.map((w) => ({ at: w.loggedAt, value: units.wt(w.weightKg) }));

  const habits: Row[] = [
    {
      key: "checkin",
      icon: "check",
      tint: colors.success,
      tintSoft: colors.successSoft,
      title: "Check-in",
      subtitle: `Today: ${dailyDone ? "done" : "not done yet"} · This week: ${weeklyDone ? "done" : "not done yet"}`,
      onPress: () => navigation.navigate("CheckIn"),
    },
    // Fynrox R1: streaks/gamification are off by default (handoff §2 #13). The calendar itself (Figma
    // progress/05) is just history, so it is always here; the streak cards inside it stay behind the flag.
    {
      key: "calendar",
      icon: r1Flags.GAMIFICATION_ENABLED ? "flame" : "calendar",
      tint: colors.orange,
      tintSoft: ACTIVITY_SOFT.orangeSoft,
      title: "Activity calendar",
      subtitle: r1Flags.GAMIFICATION_ENABLED ? "Quiet history and streaks" : "Your logged days, with rest days kept quiet",
      onPress: () => navigation.navigate("StreakTracker"),
    },
  ];

  const reports: Row[] = [
    {
      key: "insights",
      icon: "sparkles",
      tint: colors.aiAccent,
      tintSoft: colors.aiAccentSoft,
      title: "Insights",
      subtitle: "Rule-based trends from your own logs",
      onPress: () => navigation.navigate("ProgressInsights"),
    },
    {
      key: "review",
      icon: "refresh-cw",
      tint: colors.accent,
      tintSoft: colors.accentSoft,
      title: "Progress review",
      subtitle: "Recent activity and what your plan suggests",
      onPress: () => navigation.navigate("ProgressReview"),
    },
    {
      key: "decisions",
      icon: "file-text",
      tint: colors.cyan,
      tintSoft: colors.surfaceHigh,
      title: "Decision history",
      subtitle: "Suggestions you said yes or no to",
      onPress: () => navigation.navigate("DecisionHistory"),
    },
    {
      key: "timeline",
      icon: "trophy",
      tint: colors.warning,
      tintSoft: colors.warningSoft,
      title: "Life timeline",
      subtitle: "Your milestones and journey report",
      onPress: () => parent?.navigate("TimelineOverview"),
    },
  ];

  return (
    <ScreenContainer title="Progress" subtitle={goal ? `Since ${sinceLabel(goal.startedAt)}` : "Your journey"} onBack={onBack}>
      {/* Log something new without hunting for it. */}
      <View style={{ marginHorizontal: -spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
          <QuickAction icon="scale" label="Log weight" onPress={() => navigation.navigate("LogWeight")} />
          <QuickAction icon="ruler" label="Measurements" onPress={() => navigation.navigate("LogMeasurement")} />
          <QuickAction icon="camera" label="Add photo" onPress={() => navigation.navigate("ProgressPhotos")} />
          <QuickAction icon="check" label="Check-in" onPress={() => navigation.navigate("CheckIn")} />
        </ScrollView>
      </View>

      {/* Healthspan (25 Oct 2026): fitness age and heart age next to real age. */}
      <SectionHeader title="Healthspan" />
      <Pressable onPress={() => navigation.navigate("Healthspan")} accessibilityRole="button" accessibilityLabel="Healthspan: fitness age and heart age">
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.aiAccentSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="heart-pulse" size={20} color={colors.aiAccent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>
              {healthspan?.fitness.fitnessAge != null || healthspan?.heart.heartAge != null
                ? [
                    healthspan?.fitness.fitnessAge != null ? `Fitness age ${healthspan.fitness.fitnessAge}` : null,
                    healthspan?.heart.heartAge != null ? `Heart age ${healthspan.heart.heartAge}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Fitness age and heart age"}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {healthspan?.age != null ? `Your age ${healthspan.age} · estimates, not a diagnosis` : "Estimates from published research"}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </Card>
      </Pressable>

      {/* Goal */}
      <SectionHeader title="Goal" />
      <Card style={{ gap: spacing.md }}>
        {goal?.percent != null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <ProgressRing progress={goal.percent / 100} size={104} strokeWidth={9} color={theme.accent}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>{goal.percent}%</Text>
              <Text style={{ color: colors.textMuted, ...typography.caption }}>Goal</Text>
            </ProgressRing>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 17 }}>{progressHeadline(goal.percent)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                {wt(goal.startWeightKg)} → {wt(goal.currentWeightKg)}:{" "}
                {units.wt(Math.abs(goal.startWeightKg - goal.currentWeightKg)).toFixed(1)} {units.wtUnit}{" "}
                {goal.currentWeightKg <= goal.startWeightKg ? "down" : "up"} since you started.
                {goal.remainingKg
                  ? ` ${units.wt(goal.remainingKg).toFixed(1)} ${units.wtUnit} to your ${wt(goal.targetWeightKg as number)} goal.`
                  : " You have reached your goal weight."}
              </Text>
            </View>
          </View>
        ) : goal ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              Current weight {wt(goal.currentWeightKg)}. Set a goal weight to see how far along you are.
            </Text>
            <Button label="Set a goal weight" variant="secondary" size="compact" onPress={() => parent?.navigate("EditProfile")} />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>Log your weight to start tracking overall progress.</Text>
            <Button label="Log weight" size="compact" onPress={() => navigation.navigate("LogWeight")} />
          </View>
        )}
      </Card>

      {/* Body */}
      <SectionHeader title="Body" action={{ label: "History", onPress: () => navigation.navigate("MeasurementHistory") }} />
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Body weight</Text>
          {goal?.targetWeightKg != null ? (
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Goal: {wt(goal.targetWeightKg)}</Text>
          ) : null}
        </View>
        {chartPoints.length > 0 ? (
          <>
            <WeightGoalChart
              points={chartPoints}
              goal={goal?.targetWeightKg != null ? units.wt(goal.targetWeightKg) : null}
              width={chartWidth}
              accessibilityLabel={`Body weight chart, ${chartPoints.length} weigh-ins`}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Start · {wt(weightHistory[0].weightKg)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Current · {wt(weightHistory[weightHistory.length - 1].weightKg)}</Text>
            </View>
          </>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No weigh-ins yet. Log one to start a trend.</Text>
        )}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Measurements</Text>
          <Pressable onPress={() => navigation.navigate("LogMeasurement")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Update measurements">
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Update</Text>
          </Pressable>
        </View>
        {tiles.length > 0 ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {tiles.map((t) => (
              <View
                key={t.label}
                style={{ flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, paddingVertical: spacing.sm + 2, paddingHorizontal: 6, alignItems: "center", gap: 3 }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t.label}</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }} numberOfLines={1} adjustsFontSizeToFit>
                  {units.len(t.change.latest!.value)}
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>{units.lenUnit}</Text>
                </Text>
                {t.change.delta != null && t.change.delta !== 0 ? (
                  <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                    {t.change.delta < 0 ? "↓" : "↑"} {Number(units.len(Math.abs(t.change.delta)).toFixed(1))}
                    {units.lenUnit}
                  </Text>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t.change.delta === 0 ? "No change" : "First log"}</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No tape measurements logged yet.</Text>
        )}
      </Card>

      <RowGroup
        rows={[
          {
            key: "composition",
            icon: "activity",
            tint: colors.success,
            tintSoft: colors.successSoft,
            title: "Body composition",
            subtitle: "Body fat, lean mass and trends",
            onPress: () => navigation.navigate("BodyComposition"),
          },
        ]}
      />

      {/* Strength */}
      <SectionHeader title="Strength" />
      <Card style={{ gap: 0, paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3, paddingVertical: spacing.sm }}>Personal records</Text>
        {personalRecords.length > 0 ? (
          personalRecords.slice(0, 5).map((pr, i) => (
            <View
              key={pr.exerciseId}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Icon name="dumbbell" size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14, flex: 1 }} numberOfLines={1}>
                {pr.exerciseName}
              </Text>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>
                {units.wt(pr.bestWeightKg)} {units.wtUnit}
                {pr.reps > 0 ? ` × ${pr.reps}` : ""}
              </Text>
              <View style={{ backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.xs }}>
                <Text style={{ color: colors.successText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Workout log</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 14, paddingBottom: spacing.sm }}>
            Complete a workout with weighted sets to see personal records here.
          </Text>
        )}
      </Card>

      {/* Photos */}
      <SectionHeader title="Photos" />
      <Pressable onPress={() => navigation.navigate("ProgressPhotos")} accessibilityRole="button" accessibilityLabel="Transformation gallery, view gallery">
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          {latestPhoto ? (
            <Image source={{ uri: latestPhoto.imageData }} style={{ width: 48, height: 48, borderRadius: radius.md }} />
          ) : (
            <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceHigh, alignItems: "center", justifyContent: "center" }}>
              <Icon name="image" size={20} color={colors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>Transformation gallery</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"} · private to you` : "Add a photo to compare over time · private to you"}
            </Text>
          </View>
          <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>View ›</Text>
        </Card>
      </Pressable>

      {/* Habits */}
      <SectionHeader title="Habits" />
      <RowGroup rows={habits} />

      {/* Reports */}
      <SectionHeader title="Reports" />
      <RowGroup rows={reports} />
    </ScreenContainer>
  );
}
