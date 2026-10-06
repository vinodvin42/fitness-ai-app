import React from "react";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { ErrorState } from "../../components/ErrorState";
import { ProgressRing } from "../../components/ProgressRing";
import { SkeletonCard } from "../../components/Skeleton";
import { WeightGoalChart } from "../../components/ProgressCharts";
import { fetchCheckInStatus, fetchMeasurements, fetchProgressOverview, fetchProgressPhotos } from "../../api/progress";
import { BRAND_NAME } from "../../lib/brand";
import { useMeasureUnits } from "../../lib/measureUnits";
import { fieldChange, pickArms, pickThighs, signed } from "../../lib/measurementFields";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "Progress">;

function monthYear(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function progressHeadline(percent: number): string {
  if (percent >= 100) return "Goal reached!";
  if (percent >= 90) return "Almost there!";
  if (percent >= 50) return "Past the halfway mark";
  if (percent >= 10) return "Building momentum";
  return "Just getting started";
}

/**
 * Progress overview (Figma Progress 01). Everything shown is computed from the
 * user's own logs: Overall Progress % = (start - current) / (start - goal)
 * with start = first weight ever logged and goal = the target weight set in
 * Edit Profile (no goal => the card has no ring and offers "Set a goal
 * weight"). Measurement tiles show the latest value per field and its change
 * versus the previous logged value of that field. Personal Records are the
 * heaviest logged sets, tagged with their source ("Workout log").
 */
export function ProgressOverviewScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, layout.maxContentWidth) - layout.screenPadding * 2 - spacing.md * 2;
  const overview = useQuery({ queryKey: ["progress", "overview"], queryFn: fetchProgressOverview });
  const measurements = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });
  const photos = useQuery({ queryKey: ["progressPhotos"], queryFn: fetchProgressPhotos });
  const { data: checkInStatus } = useQuery({ queryKey: ["checkIns", "status"], queryFn: fetchCheckInStatus });

  const parent = navigation.getParent<NavigationProp<MoreStackParamList>>();

  if (overview.isError) {
    return (
      <ScreenContainer title="Progress" eyebrow={BRAND_NAME}>
        <ErrorState onRetry={() => overview.refetch()} />
      </ScreenContainer>
    );
  }
  if (overview.isLoading || !overview.data) {
    return (
      <ScreenContainer title="Progress" eyebrow={BRAND_NAME}>
        <SkeletonCard lines={4} />
      </ScreenContainer>
    );
  }

  const { weightHistory, personalRecords, goal } = overview.data;
  const rows = measurements.data ?? [];
  const wt = (kg: number) => `${units.wt(kg).toFixed(1)} ${units.wtUnit}`;
  const periodLabel = goal ? `${monthYear(goal.startedAt)} - ${monthYear(new Date().toISOString())}` : null;

  const tiles = [
    { label: "Chest", change: fieldChange(rows, (m) => m.chestCm) },
    { label: "Waist", change: fieldChange(rows, (m) => m.waistCm) },
    { label: "Arms", change: fieldChange(rows, pickArms) },
    { label: "Thighs", change: fieldChange(rows, pickThighs) },
  ].filter((t) => t.change.latest);

  const dailyDone = checkInStatus?.daily.submitted ?? false;
  const weeklyDone = checkInStatus?.weekly.submitted ?? false;
  const latestPhoto = photos.data?.[0] ?? null;
  const chartPoints = weightHistory.map((w) => ({ at: w.loggedAt, value: units.wt(w.weightKg) }));

  return (
    <ScreenContainer
      title="Progress"
      eyebrow={BRAND_NAME}
      subtitle={periodLabel ? `Your journey · ${periodLabel}` : "Your journey"}
    >
      <Card style={{ gap: spacing.md }}>
        <Text style={{ color: colors.textSecondary, ...typography.label }}>Overall Progress</Text>
        {goal?.percent != null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <ProgressRing progress={goal.percent / 100} size={104} strokeWidth={9} color={colors.accent}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22 }}>{goal.percent}%</Text>
              <Text style={{ color: colors.textMuted, ...typography.caption }}>Goal</Text>
            </ProgressRing>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{progressHeadline(goal.percent)}</Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>
                {wt(goal.startWeightKg)} to {wt(goal.currentWeightKg)}:{" "}
                {units.wt(Math.abs(goal.startWeightKg - goal.currentWeightKg)).toFixed(1)} {units.wtUnit}{" "}
                {goal.currentWeightKg <= goal.startWeightKg ? "down" : "up"} since you started.
                {goal.remainingKg
                  ? ` ${units.wt(goal.remainingKg).toFixed(1)} ${units.wtUnit} remains to your ${wt(goal.targetWeightKg as number)} goal.`
                  : " You have reached your goal weight."}
              </Text>
            </View>
          </View>
        ) : goal ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
              Current weight {wt(goal.currentWeightKg)}. Set a goal weight to see how far along you are.
            </Text>
            <Button label="Set a goal weight" variant="secondary" onPress={() => parent?.navigate("EditProfile")} style={{ height: 42 }} />
          </View>
        ) : (
          <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>Log your weight to start tracking overall progress.</Text>
        )}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Body Weight</Text>
          {goal?.targetWeightKg != null ? (
            <Text style={{ color: colors.accent, ...typography.label }}>Goal: {wt(goal.targetWeightKg)}</Text>
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
              <Text style={{ color: colors.textMuted, ...typography.meta }}>Start ({wt(weightHistory[0].weightKg)})</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                Current ({wt(weightHistory[weightHistory.length - 1].weightKg)})
              </Text>
            </View>
          </>
        ) : (
          <Text style={{ color: colors.textMuted }}>No weigh-ins yet. Log one to start a trend.</Text>
        )}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Measurements</Text>
          <Pressable onPress={() => navigation.navigate("LogMeasurement")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Update measurements">
            <Text style={{ color: colors.accent, ...typography.label }}>Update</Text>
          </Pressable>
        </View>
        {tiles.length > 0 ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {tiles.map((t) => (
              <View
                key={t.label}
                style={{ flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, padding: spacing.sm, alignItems: "center", gap: 2 }}
              >
                <Text style={{ color: colors.textMuted, ...typography.caption }}>{t.label}</Text>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 15 }}>
                  {units.len(t.change.latest!.value)}
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>{units.lenUnit}</Text>
                </Text>
                {t.change.delta != null ? (
                  <Text style={{ color: colors.accent, ...typography.caption }}>
                    {signed(units.len(Math.abs(t.change.delta)) * Math.sign(t.change.delta))}
                    {units.lenUnit}
                  </Text>
                ) : (
                  <Text style={{ color: colors.textMuted, ...typography.caption }}>First log</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: colors.textMuted }}>No tape measurements logged yet.</Text>
        )}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Personal Records</Text>
        {personalRecords.length > 0 ? (
          personalRecords.slice(0, 5).map((pr) => (
            <View key={pr.exerciseId} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 }}>
              <Icon name="dumbbell" size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
                {pr.exerciseName}
              </Text>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold }}>
                {units.wt(pr.bestWeightKg)} {units.wtUnit}
              </Text>
              <Text
                style={{
                  color: colors.accent,
                  ...typography.caption,
                  backgroundColor: colors.accentSoft,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                }}
              >
                Workout log
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textMuted }}>Complete a workout with weighted sets to see PRs here.</Text>
        )}
      </Card>

      <Pressable onPress={() => navigation.navigate("ProgressPhotos")} accessibilityRole="button" accessibilityLabel="Transformation Gallery, view gallery">
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm }}>
          {latestPhoto ? (
            <Image source={{ uri: latestPhoto.imageData }} style={{ width: 44, height: 44, borderRadius: radius.sm }} />
          ) : (
            <View
              style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="image" size={20} color={colors.textMuted} />
            </View>
          )}
          <Text style={{ color: colors.textPrimary, ...typography.label, flex: 1 }}>Transformation Gallery</Text>
          <Text style={{ color: colors.accent, ...typography.label }}>View Gallery</Text>
        </Card>
      </Pressable>

      <Text style={{ color: colors.textSecondary, ...typography.label, marginTop: spacing.sm }}>More</Text>
      <View style={{ gap: spacing.sm }}>
        <ListRow
          icon="sparkles"
          title="Insights"
          subtitle="Rule-based trends from your own logs"
          tint={colors.aiAccent}
          tintSoft={colors.aiAccentSoft}
          onPress={() => navigation.navigate("ProgressInsights")}
        />
        <ListRow
          icon="trophy"
          title="Life Timeline"
          subtitle="Your milestones and journey report"
          tint={colors.accent}
          tintSoft={colors.accentSoft}
          onPress={() => parent?.navigate("TimelineOverview")}
        />
        <ListRow
          icon="activity"
          title="Body Composition"
          subtitle="Body fat, lean mass and trends"
          tint={colors.success}
          tintSoft={colors.successSoft}
          onPress={() => navigation.navigate("BodyComposition")}
        />
        <ListRow
          icon="ruler"
          title="Body Measurements"
          subtitle="History and changes"
          tint={colors.textSecondary}
          tintSoft={colors.surfaceHigh}
          onPress={() => navigation.navigate("MeasurementHistory")}
        />
        <ListRow
          icon="flame"
          title="Activity Calendar"
          subtitle="Quiet history and streaks"
          tint={colors.orange}
          tintSoft="rgba(251,146,60,0.16)"
          onPress={() => navigation.navigate("StreakTracker")}
        />
        <ListRow
          icon="check"
          title="Check-In"
          subtitle={`${dailyDone ? "Today's check-in done" : "Today's check-in not done yet"} · ${weeklyDone ? "this week's done" : "this week's not done yet"}`}
          tint={colors.success}
          tintSoft={colors.successSoft}
          onPress={() => navigation.navigate("CheckIn")}
        />
        <ListRow
          icon="refresh-cw"
          title="Progress Review"
          subtitle="Recent activity and what your plan suggests"
          tint={colors.aiAccent}
          tintSoft={colors.aiAccentSoft}
          onPress={() => navigation.navigate("ProgressReview")}
        />
      </View>
    </ScreenContainer>
  );
}
