import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { ErrorState } from "../../components/ErrorState";
import { fetchCheckInStatus, fetchProgressOverview } from "../../api/progress";
import { colors, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";
import { r1Flags } from "@fitness-ai-app/config";

type Props = NativeStackScreenProps<ProgressStackParamList, "Progress">;

/**
 * Progress Overview (docs/mobile/03-screen-inventory.md §F) — Phase 2
 * scope: the latest measurements grid and Personal Records computed from
 * real ExerciseSetLog data. Not built: overall-progress ring toward a goal
 * (no goal concept exists — same gap as the Nutrition Dashboard's calorie
 * ring, docs/mobile/07-open-questions-gaps.md §10). Also 19 Aug 2026: a
 * "View Streaks" entry point into Streak Tracker (real training/
 * nutrition/hydration streaks — see gap §29), and a "Progress Photos"
 * entry point (real capture/upload + before/after comparison — see gap
 * §34) — the transformation-photo gallery link this doc comment used to
 * flag as unbuilt is now real.
 *
 * U5 (15 Sep 2026): a "Progress Review" entry point — the new periodic/
 * reflective screen (docs/mobile/07-open-questions-gaps.md §47), distinct
 * from this day-to-day dashboard: recent activity plus whatever the real
 * Recommendation engine currently suggests, with "Why This Changed" one
 * tap away from there.
 *
 * 20 Aug 2026: the weight trend is now a real **line chart**
 * (`WeightTrendChart`, `react-native-svg`, newly installed this pass —
 * see gap §36), replacing the bar-based stand-in this doc comment used to
 * flag as a placeholder for "no charting library installed." A real
 * min/max range and the visible history's date span render below the
 * line. `react-native-svg` was chosen over a full charting library (e.g.
 * victory-native) since a hand-rolled polyline is all a single-series
 * sparkline needs — same "smallest real dependency for the job" instinct
 * as RestTimer's hand-rolled numeral+bar instead of a gesture-based ring
 * library (gap §24).
 *
 * 15 Sep 2026 (U5): a real **Check-In** entry point — see
 * `CheckInScreen.tsx`'s own doc comment for the full design. The status
 * card below reads `GET /check-ins/status` plainly (never guesses): it
 * shows whichever real state is true, today's/this week's check-in either
 * done or not, with no fabricated in-between "pending" state.
 */
export function ProgressOverviewScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["progress", "overview"],
    queryFn: fetchProgressOverview,
  });
  const { data: checkInStatus } = useQuery({ queryKey: ["checkIns", "status"], queryFn: fetchCheckInStatus });

  if (isError) {
    return (
      <ScreenContainer title="Progress">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !data) {
    return (
      <ScreenContainer title="Progress">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const { latestMeasurement, weightHistory, personalRecords } = data;

  const dailyDone = checkInStatus?.daily.submitted ?? false;
  const weeklyDone = checkInStatus?.weekly.submitted ?? false;

  return (
    <ScreenContainer title="Progress">
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Icon name="check" size={18} color={colors.success} />
          <Text style={{ color: colors.textSecondary }}>Check-In</Text>
        </View>
        <Text style={{ color: colors.textPrimary, marginTop: spacing.xs }}>
          {dailyDone ? "Today's check-in done" : "Today's check-in not done yet"}
          {" · "}
          {weeklyDone ? "this week's done" : "this week's not done yet"}
        </Text>
        <Button
          label={dailyDone && weeklyDone ? "View Check-In" : "Check In"}
          variant="secondary"
          onPress={() => navigation.navigate("CheckIn")}
          style={{ marginTop: spacing.md, height: 42 }}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Icon name="trending-up" size={18} color={colors.accent} />
          <Text style={{ color: colors.textSecondary }}>Weight trend</Text>
        </View>
        {weightHistory.length > 0 ? (
          <>
            <Text style={{ color: colors.textPrimary, ...typography.metricLarge, marginTop: spacing.xs }}>
              {weightHistory[weightHistory.length - 1].weightKg} kg
            </Text>
            <WeightTrendChart history={weightHistory} />
          </>
        ) : (
          <Text style={{ color: colors.textMuted, marginTop: spacing.xs }}>
            No weigh-ins yet — log one to start a trend.
          </Text>
        )}
      </Card>

      {latestMeasurement ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
            Latest measurements ({new Date(latestMeasurement.loggedAt).toLocaleDateString()})
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            <Measurement label="Chest" value={latestMeasurement.chestCm} />
            <Measurement label="Waist" value={latestMeasurement.waistCm} />
            <Measurement label="Hips" value={latestMeasurement.hipsCm} />
            <Measurement label="Arms" value={latestMeasurement.armsCm} />
            <Measurement label="Thighs" value={latestMeasurement.thighsCm} />
          </View>
        </Card>
      ) : null}

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Icon name="trophy" size={18} color={colors.warning} />
          <Text style={{ color: colors.textSecondary }}>Personal records</Text>
        </View>
        {personalRecords.length > 0 ? (
          personalRecords.map((pr) => (
            <View
              key={pr.exerciseId}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.xs }}
            >
              <Text style={{ color: colors.textPrimary }}>{pr.exerciseName}</Text>
              <Text style={{ color: colors.warning, ...typography.label }}>
                {pr.bestWeightKg}kg × {pr.reps}
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textMuted }}>Complete a workout with weighted sets to see PRs here.</Text>
        )}
      </Card>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <ListRow
          icon="sparkles"
          title="Progress Review"
          subtitle="Recent activity and what your plan suggests"
          tint={colors.aiAccent}
          tintSoft={colors.aiAccentSoft}
          onPress={() => navigation.navigate("ProgressReview")}
        />
        <ListRow icon="plus" title="Log Measurement" tint={colors.accent} tintSoft={colors.accentSoft} onPress={() => navigation.navigate("LogMeasurement")} />
        <ListRow icon="calendar" title="Measurement History" tint={colors.textSecondary} tintSoft={colors.surfaceHigh} onPress={() => navigation.navigate("MeasurementHistory")} />
        {/* Handoff §2 decision #13 and the Overview's "Gamification: None
            in R1 (no streaks, badges, achievements)". Hidden behind the
            R1 flag rather than deleted — the screen, its API and its
            tests still work, so restoring it is a config change if the
            decision is revisited. Default is off, i.e. spec-compliant. */}
        {r1Flags.GAMIFICATION_ENABLED ? (
          <ListRow icon="flame" title="Streak Tracker" tint={colors.orange} tintSoft="rgba(251,146,60,0.16)" onPress={() => navigation.navigate("StreakTracker")} />
        ) : null}
        <ListRow icon="heart" title="Progress Photos" tint={colors.pink} tintSoft="rgba(236,72,153,0.16)" onPress={() => navigation.navigate("ProgressPhotos")} />
      </View>
    </ScreenContainer>
  );
}

function Measurement({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <View style={{ minWidth: 72 }}>
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{value}cm</Text>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
    </View>
  );
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 90;
const CHART_PADDING = 10;

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A real single-series line chart (`react-native-svg`'s `Polyline` +
 * `Circle` per data point), scaled between the visible history's own
 * min/max — same "relative to what's on screen, not an absolute scale"
 * choice the old bar-based stand-in already made, just rendered as a real
 * line now. `viewBox` handles responsive scaling (the `Svg` itself is
 * `width="100%"`), so this doesn't need an `onLayout` width measurement.
 */
function WeightTrendChart({ history }: { history: Array<{ weightKg: number; loggedAt: string }> }) {
  const values = history.map((h) => h.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = history.map((h, i) => {
    const x =
      history.length === 1
        ? CHART_WIDTH / 2
        : CHART_PADDING + (i / (history.length - 1)) * (CHART_WIDTH - CHART_PADDING * 2);
    const y = CHART_HEIGHT - CHART_PADDING - ((h.weightKg - min) / range) * (CHART_HEIGHT - CHART_PADDING * 2);
    return { x, y };
  });

  return (
    <View style={{ marginTop: spacing.md }}>
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <Polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={colors.accent}
          strokeWidth={2}
        />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={colors.accent} />
        ))}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs }}>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{fmtShortDate(history[0].loggedAt)}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          {min}–{max} kg
        </Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          {fmtShortDate(history[history.length - 1].loggedAt)}
        </Text>
      </View>
    </View>
  );
}
