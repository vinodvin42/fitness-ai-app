import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { fetchCurrentPlan } from "../../api/plans";
import { fetchProgressOverview } from "../../api/progress";
import { fetchWorkoutHistory } from "../../api/workoutSessions";
import { fetchCurrentRecommendation, generateRecommendation } from "../../api/recommendations";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "ProgressReview">;

const RECENT_WORKOUTS_SHOWN = 3;

/**
 * Progress Review (U5, 15 Sep 2026) — the new periodic/reflective screen
 * this milestone names (§4), distinct from the existing day-to-day
 * `ProgressOverviewScreen` dashboard (weight chart, measurements, PRs —
 * unchanged, untouched by this pass). Where that screen is "log and check
 * numbers whenever," this one is "step back: here's what you've actually
 * done lately, and here's what your plan suggests as a result" — the
 * natural landing place a user would reach "Why This Changed" from, per
 * this milestone's own framing.
 *
 * Same audit finding as U3's Today/Plan work (see
 * docs/mobile/07-open-questions-gaps.md §44): apps/api's Recommendation
 * engine (`plans.service.ts#generateRecommendation`/`getCurrentRecommendation`,
 * already fully built and tested — see apps/api/tests/plans.test.ts) had
 * **zero** mobile consumer before this pass. This screen and
 * `WhyThisChangedScreen` are that wiring.
 *
 * BR-AI-010 ("Continue Current Plan / No Change is valid") shapes the
 * Recommendation card below: there is no "bad" or "error" outcome here —
 * either a live Recommendation exists (whatever kind), or none does yet
 * because nothing has been checked, both shown the same calm way ErrorState
 * reserves for real failures instead.
 */
export function ProgressReviewScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isChecking, setIsChecking] = useState(false);

  const { data: plan } = useQuery({ queryKey: ["plans", "current"], queryFn: fetchCurrentPlan });
  const { data: history } = useQuery({ queryKey: ["workoutHistory"], queryFn: fetchWorkoutHistory });
  const { data: overview } = useQuery({ queryKey: ["progress", "overview"], queryFn: fetchProgressOverview });
  const {
    data: recommendation,
    isLoading: isRecommendationLoading,
    isError: isRecommendationError,
    refetch: refetchRecommendation,
  } = useQuery({ queryKey: ["recommendations", "current"], queryFn: fetchCurrentRecommendation });

  const recentCompleted = (history ?? []).filter((h) => h.status === "completed").slice(0, RECENT_WORKOUTS_SHOWN);
  const weightHistory = overview?.weightHistory ?? [];
  const latestWeight = weightHistory[weightHistory.length - 1] ?? null;
  const previousWeight = weightHistory.length > 1 ? weightHistory[weightHistory.length - 2] : null;
  const weightDelta = latestWeight && previousWeight ? Math.round((latestWeight.weightKg - previousWeight.weightKg) * 10) / 10 : null;

  const onCheckForRecommendation = async () => {
    setIsChecking(true);
    try {
      const rec = await generateRecommendation();
      queryClient.setQueryData(["recommendations", "current"], rec);
      navigation.navigate("WhyThisChanged", { recommendation: rec });
    } catch (err) {
      Alert.alert(
        "Couldn't check for a recommendation",
        extractErrorMessage(err, "Check your connection and try again."),
      );
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <ScreenContainer title={t("progress.review.title")} subtitle={t("progress.review.subtitle")}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Icon name="dumbbell" size={18} color={colors.accent} />
          <Text style={{ color: colors.textSecondary }}>{t("progress.review.recentTraining")}</Text>
        </View>
        {recentCompleted.length > 0 ? (
          recentCompleted.map((h) => (
            <View key={h.id} style={{ paddingVertical: spacing.xs }}>
              <Text style={{ color: colors.textPrimary, ...typography.body }}>
                {h.workoutName} · {h.programName}
              </Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                {h.completedAt ? new Date(h.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                {h.totalSets ? ` · ${h.totalSets} set${h.totalSets === 1 ? "" : "s"}` : ""}
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textMuted }}>{t("progress.review.noWorkouts")}</Text>
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Icon name="trending-up" size={18} color={colors.cyan} />
          <Text style={{ color: colors.textSecondary }}>{t("progress.weightTrend")}</Text>
        </View>
        {latestWeight ? (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{latestWeight.weightKg} kg</Text>
            {weightDelta !== null ? (
              <Text style={{ color: weightDelta === 0 ? colors.textMuted : colors.textSecondary, ...typography.meta }}>
                {weightDelta > 0 ? `+${weightDelta}` : weightDelta} kg since last weigh-in
              </Text>
            ) : (
              <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("progress.review.oneWeighIn")}</Text>
            )}
          </View>
        ) : (
          <Text style={{ color: colors.textMuted }}>{t("progress.review.noWeighIns")}</Text>
        )}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Icon name="sparkles" size={18} color={colors.aiAccent} />
          <Text style={{ color: colors.textSecondary }}>{t("progress.review.yourRecommendation")}</Text>
        </View>

        {isRecommendationLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : isRecommendationError ? (
          <ErrorState message={t("progress.review.error")} onRetry={() => refetchRecommendation()} />
        ) : recommendation ? (
          <>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
              {recommendation.kind === "no_change"
                ? t("progress.review.continueCurrent")
                : t("progress.review.switchTo", {
                    program: recommendation.suggestedProgramName ?? t("progress.review.aNewProgram"),
                  })}
            </Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }} numberOfLines={2}>
              {recommendation.rationale}
            </Text>
            <Button
              label={t("progress.review.whyThisChanged")}
              variant="secondary"
              onPress={() => navigation.navigate("WhyThisChanged", { recommendation })}
              style={{ marginTop: spacing.md }}
            />
          </>
        ) : (
          <>
            <Text style={{ color: colors.textMuted }}>
              {plan?.status === "generated"
                ? "Check your recent activity against your plan to see if anything should change."
                : "Generate a plan first to get a recommendation."}
            </Text>
            {plan?.status === "generated" ? (
              <Button
                label={t("progress.review.check")}
                loading={isChecking}
                onPress={onCheckForRecommendation}
                style={{ marginTop: spacing.md }}
              />
            ) : null}
          </>
        )}
      </Card>
    </ScreenContainer>
  );
}
