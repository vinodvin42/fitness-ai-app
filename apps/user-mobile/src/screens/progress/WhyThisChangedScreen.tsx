import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Program, Recommendation, RecommendationStatus } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { SelectCard } from "../../components/SelectCard";
import { fetchCurrentPlan } from "../../api/plans";
import { fetchPrograms } from "../../api/programs";
import { decideRecommendation, fetchCurrentRecommendation, generateRecommendation } from "../../api/recommendations";
import { trackClientEvent } from "../../api/analytics";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "WhyThisChanged">;

/**
 * Why This Changed (U5, 15 Sep 2026) — the required screen (§4) for
 * actually reviewing a live Recommendation, wired to apps/api's already-
 * built, already-tested `decideRecommendation` (see
 * apps/api/src/modules/plans/plans.service.ts's own doc comment, and
 * apps/api/tests/plans.test.ts's full accept/decline/modify/no_change
 * coverage). Zero client integration existed before this pass — the exact
 * same situation U3 found the sibling Plan-Generation engine in before it
 * wired Today to it (docs/mobile/07-open-questions-gaps.md §44).
 *
 * **BR-AI-010** ("Continue Current Plan / No Change is valid") is the real
 * design constraint on this screen: a `no_change` recommendation, and a
 * `no_change` DECISION (accepting one), are both rendered with exactly the
 * same positive, first-class treatment as a program switch — success
 * color, no "nothing happened" framing, no error iconography. Likewise
 * `declined` is a legitimate user choice, not a failure — it gets a
 * neutral muted treatment, not `colors.danger`. **BR-AI-011** ("uncertainty
 * is visible and valid") is carried by the rationale text itself: the real
 * prompt behind this data (`plans.service.ts#buildRecommendationPrompt`)
 * is explicitly instructed to name thin evidence as a real reason for
 * `no_change` rather than inventing confidence, so the rationale shown
 * here is already honest about it — nothing added is invented on top.
 *
 * Takes the whole `Recommendation` as an optional nav param — same
 * "already have it, don't refetch" convention `ConfirmFoodEstimateScreen`
 * (U4) already established — so `ProgressReviewScreen` can hand off a
 * freshly-generated one directly. Reachable with no param too: fetches
 * the current one itself, and offers to generate one if none exists yet.
 *
 * Analytics (U7, 15 Sep 2026): `recommendation.viewed` fires client-side
 * (below) the first time a real Recommendation is actually on screen — a
 * render, not a mutation, so it has no natural server call to attach to
 * (see api/analytics.ts's own doc comment). `accepted/declined/no_change`
 * are tracked server-side in `decideRecommendation()`
 * (plans.service.ts), since those really are mutations.
 */
export function WhyThisChangedScreen({ route }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const passedRecommendation = route.params?.recommendation;

  const [recommendation, setRecommendation] = useState<Recommendation | null | undefined>(passedRecommendation);
  const [hasHydrated, setHasHydrated] = useState(!!passedRecommendation);
  const [isDeciding, setIsDeciding] = useState(false);
  const [isCheckingNow, setIsCheckingNow] = useState(false);
  const [isPickingReplacement, setIsPickingReplacement] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const {
    data: fetchedRecommendation,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["recommendations", "current"],
    queryFn: fetchCurrentRecommendation,
    enabled: !passedRecommendation,
  });

  // One-time hydration from the fetched query, same guarded pattern
  // ActiveWorkoutScreen's own U3 resume effect uses — after this, local
  // state (updated directly by onDecide below) is the source of truth, so
  // a background refetch of the now-decided recommendation never clobbers
  // what's on screen.
  useEffect(() => {
    if (hasHydrated || passedRecommendation || fetchedRecommendation === undefined) return;
    setRecommendation(fetchedRecommendation);
    setHasHydrated(true);
  }, [hasHydrated, passedRecommendation, fetchedRecommendation]);

  // §8 "recommendation.viewed" — fires once per distinct recommendation id
  // actually rendered on this screen, guarded by a ref so re-renders (or
  // the local state update onDecide makes to the SAME recommendation)
  // never double-fire it.
  const viewedRecommendationId = useRef<string | null>(null);
  useEffect(() => {
    if (!recommendation || viewedRecommendationId.current === recommendation.id) return;
    viewedRecommendationId.current = recommendation.id;
    trackClientEvent("recommendation.viewed", { recommendationId: recommendation.id, planId: recommendation.planId });
  }, [recommendation]);

  const { data: currentPlan } = useQuery({ queryKey: ["plans", "current"], queryFn: fetchCurrentPlan });
  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: fetchPrograms,
    enabled: isPickingReplacement,
  });
  const replacementOptions: Program[] = (programs ?? []).filter((p) => p.id !== currentPlan?.programId);

  const invalidateDownstream = () => {
    queryClient.invalidateQueries({ queryKey: ["recommendations", "current"] });
    queryClient.invalidateQueries({ queryKey: ["plans", "current"] });
    queryClient.invalidateQueries({ queryKey: ["plans", "current", "nextWorkout"] });
  };

  const onDecide = async (input: Parameters<typeof decideRecommendation>[1]) => {
    if (!recommendation) return;
    setIsDeciding(true);
    try {
      const updated = await decideRecommendation(recommendation.id, input);
      setRecommendation(updated);
      setIsPickingReplacement(false);
      setSelectedProgramId(null);
      invalidateDownstream();
    } catch (err) {
      Alert.alert("Couldn't save your decision", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsDeciding(false);
    }
  };

  const onCheckNow = async () => {
    setIsCheckingNow(true);
    try {
      const rec = await generateRecommendation();
      setRecommendation(rec);
      setHasHydrated(true);
      queryClient.setQueryData(["recommendations", "current"], rec);
    } catch (err) {
      Alert.alert(
        "Couldn't check for a recommendation",
        extractErrorMessage(err, "Check your connection and try again."),
      );
    } finally {
      setIsCheckingNow(false);
    }
  };

  if (!passedRecommendation && isLoading) {
    return (
      <ScreenContainer title={t("progress.whyChanged.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (!passedRecommendation && isError) {
    return (
      <ScreenContainer title={t("progress.whyChanged.title")}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (!recommendation) {
    return (
      <ScreenContainer title={t("progress.whyChanged.title")}>
        <EmptyState
          title={t("progress.whyChanged.emptyTitle")}
          subtitle={t("progress.whyChanged.emptySubtitle")}
          actionLabel={isCheckingNow ? "Checking…" : "Check Now"}
          onAction={isCheckingNow ? undefined : onCheckNow}
        />
      </ScreenContainer>
    );
  }

  const kindTitle =
    recommendation.kind === "no_change"
      ? "Continue Current Plan"
      : `Switch to ${recommendation.suggestedProgramName ?? "a new program"}`;
  const status = statusPresentation(recommendation.status);
  const isUndecided = recommendation.status === "active";

  return (
    <ScreenContainer title={t("progress.whyChanged.title")} subtitle={new Date(recommendation.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Icon name={status.icon} size={18} color={status.color} />
          <Text style={{ color: status.color, ...typography.label }}>{status.label}</Text>
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{kindTitle}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.body, marginTop: spacing.sm }}>
          {recommendation.rationale}
        </Text>
      </Card>

      {isUndecided ? (
        isPickingReplacement ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>{t("progress.whyChanged.chooseDifferent")}</Text>
            <View style={{ gap: spacing.sm }}>
              {replacementOptions.length > 0 ? (
                replacementOptions.map((p) => (
                  <SelectCard
                    key={p.id}
                    title={p.name}
                    subtitle={`${p.durationWeeks} weeks`}
                    selected={selectedProgramId === p.id}
                    onPress={() => setSelectedProgramId(p.id)}
                  />
                ))
              ) : (
                <Text style={{ color: colors.textMuted }}>{t("progress.whyChanged.noOthers")}</Text>
              )}
            </View>
            <Button
              label={t("progress.whyChanged.confirmSwitch")}
              disabled={!selectedProgramId}
              loading={isDeciding}
              onPress={() =>
                selectedProgramId && onDecide({ action: "modify", replacementProgramId: selectedProgramId })
              }
              style={{ marginTop: spacing.lg }}
            />
            <Button
              label={t("common.cancel")}
              variant="secondary"
              onPress={() => {
                setIsPickingReplacement(false);
                setSelectedProgramId(null);
              }}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        ) : (
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Button
              label={recommendation.kind === "no_change" ? "Continue Current Plan" : "Accept & Switch"}
              loading={isDeciding}
              onPress={() => onDecide({ action: "accept" })}
            />
            <Button
              label={t("progress.whyChanged.chooseAnother")}
              variant="secondary"
              disabled={isDeciding}
              onPress={() => setIsPickingReplacement(true)}
            />
            <Button label={t("progress.whyChanged.decline")} variant="secondary" loading={isDeciding} onPress={() => onDecide({ action: "decline" })} />
          </View>
        )
      ) : null}
    </ScreenContainer>
  );
}

function statusPresentation(status: RecommendationStatus): { label: string; color: string; icon: "sparkles" | "check" | "minus" | "target" | "refresh-cw" } {
  switch (status) {
    case "active":
      return { label: "Awaiting your review", color: colors.aiAccent, icon: "sparkles" };
    case "accepted":
      return { label: "Accepted", color: colors.success, icon: "check" };
    case "modified":
      return { label: "Modified", color: colors.accent, icon: "target" };
    case "declined":
      // A real, legitimate choice (BR-AI-010's neighbor rule) — muted, not danger.
      return { label: "Declined", color: colors.textSecondary, icon: "minus" };
    case "no_change":
      // BR-AI-010: "Continue Current Plan / No Change is valid" — success
      // treatment, same as an accepted switch, never an error/empty state.
      return { label: "Confirmed — No Change", color: colors.success, icon: "check" };
    case "superseded":
      return { label: "Superseded by a newer recommendation", color: colors.textMuted, icon: "refresh-cw" };
    default:
      return { label: status, color: colors.textMuted, icon: "sparkles" };
  }
}
