import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Plan } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { useAuth } from "../../context/AuthContext";
import { generatePlan, retryPlanGeneration } from "../../api/plans";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "PlanGenerating">;

type ScreenState =
  | { phase: "generating" }
  | { phase: "generated"; plan: Plan }
  | { phase: "failed"; plan: Plan | null; errorMessage: string };

/**
 * Plan Generating / Generated / Failed / Retry (U2, 15 Sep 2026) — the
 * required Plan-state screen this milestone names, wired to apps/api's
 * already-built Plan-Generation Engine (apps/api/src/modules/plans). Zero
 * client integration existed before this pass.
 *
 * POST /plans/generate is synchronous server-side — it awaits the real LLM
 * call and resolves with the FINAL status ("generated" or "failed"), never
 * "generating"; that phase only exists here, as the loading state while
 * the request is in flight (a real several-second wait, not simulated).
 * See plans.service.ts's own doc comment for why a Plan is a validated
 * SELECTION of a real, admin-authored Program, never AI-authored content.
 *
 * "Plan-generation failure must preserve assessment and support retry"
 * (Developer 1's own §9 requirement): the assessment PUT already succeeded
 * before this screen is ever reached (AssessmentSummaryScreen), so a
 * failure here never loses it — Retry just re-runs generation against the
 * same already-saved OnboardingProfile. "Skip for now" exists as a modest,
 * honest safety valve (e.g. if AI isn't configured on the server at all) —
 * without it a user could be fully blocked from the app by an
 * infrastructure problem that isn't theirs to fix.
 */
export function PlanGeneratingScreen(_props: Props) {
  const { clearDraft } = useOnboardingWizard();
  const { markOnboardingCompleted } = useAuth();
  const [screenState, setScreenState] = useState<ScreenState>({ phase: "generating" });

  const applyResult = (plan: Plan) => {
    if (plan.status === "generated") {
      setScreenState({ phase: "generated", plan });
    } else {
      setScreenState({ phase: "failed", plan, errorMessage: plan.failureReason ?? "Plan generation failed" });
    }
  };

  const runGenerate = async () => {
    setScreenState({ phase: "generating" });
    try {
      applyResult(await generatePlan());
    } catch (err) {
      setScreenState({
        phase: "failed",
        plan: null,
        errorMessage: extractErrorMessage(err, "Couldn't generate your plan — check your connection and try again."),
      });
    }
  };

  const runRetry = async (planId: string) => {
    setScreenState({ phase: "generating" });
    try {
      applyResult(await retryPlanGeneration(planId));
    } catch (err) {
      setScreenState({
        phase: "failed",
        plan: null,
        errorMessage: extractErrorMessage(err, "Couldn't generate your plan — check your connection and try again."),
      });
    }
  };

  // Runs once on mount, deliberately not re-run on any dependency change —
  // this is a one-shot "generate on arrival" screen, not a re-fetching one.
  useEffect(() => {
    runGenerate();
  }, []);

  const finishOnboarding = async () => {
    await clearDraft();
    markOnboardingCompleted(); // flips RootNavigator over to MainTabs
  };

  if (screenState.phase === "generating") {
    return (
      <ScreenContainer title="Building your plan" scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={{ color: colors.textSecondary, ...typography.body, marginTop: spacing.md, textAlign: "center" }}>
            Picking the right program for your goals and safety context…
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (screenState.phase === "generated") {
    const { plan } = screenState;
    return (
      <ScreenContainer title="Your plan is ready">
        <Card>
          <Text style={{ fontSize: 40, textAlign: "center" }}>🎯</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.sm, textAlign: "center" }}>
            {plan.programName ?? "Your program"}
          </Text>
          {plan.rationale ? (
            <Text style={{ color: colors.textSecondary, ...typography.body, marginTop: spacing.md }}>
              {plan.rationale}
            </Text>
          ) : null}
        </Card>
        <Button label="Get Started" onPress={finishOnboarding} style={{ marginTop: spacing.lg }} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Couldn't build your plan">
      <Card>
        <Text style={{ color: colors.danger, ...typography.body }}>{screenState.errorMessage}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
          Your assessment answers are saved — nothing is lost. Try again below.
        </Text>
      </Card>
      <Button
        label="Retry"
        onPress={() => (screenState.plan ? runRetry(screenState.plan.id) : runGenerate())}
        style={{ marginTop: spacing.lg }}
      />
      <Button
        label="Skip for now — I'll set this up later"
        variant="secondary"
        onPress={finishOnboarding}
        style={{ marginTop: spacing.sm }}
      />
    </ScreenContainer>
  );
}
