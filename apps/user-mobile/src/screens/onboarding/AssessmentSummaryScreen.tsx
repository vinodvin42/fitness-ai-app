import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { Card } from "../../components/Card";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "AssessmentSummary">;

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, ...typography.body }}>{value}</Text>
    </View>
  );
}

/**
 * Assessment Summary (U2, 15 Sep 2026) — a required screen per Developer
 * 1's R1 work package (§4) that had zero implementation before this pass;
 * the wizard used to submit directly from SafetyScreen with no review
 * step at all.
 *
 * This is also where the real submit (PUT /users/me/onboarding) happens
 * now, and where BR-SAF-004 ("safety escalation is independent of
 * recovery/readiness") gets its honest, Developer-1-ownable interpretation:
 * the Safety card below is always shown, unconditionally, before any AI
 * plan-generation logic ever runs — it doesn't depend on what a plan ends
 * up recommending. What this deliberately is NOT: a real escalation to a
 * professional or admin (no notification, no human review triggered) —
 * that would cross into Developer 3's admin/professional-workspace
 * ownership (explicitly "Do Not Own" per this work package's own table),
 * and no such inbox/workflow exists yet to escalate into. This is the
 * honest minimum: the user's own reported safety context, surfaced back to
 * them plainly, every time, regardless of outcome.
 */
export function AssessmentSummaryScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { state, submit } = useOnboardingWizard();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onConfirm = async () => {
    setIsSubmitting(true);
    try {
      await submit();
      navigation.replace("PlanGenerating");
    } catch (err) {
      Alert.alert("Couldn't finish setup", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSafetyInfo = state.medicalConditions.length > 0 || state.injuries.length > 0;

  const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  const EQUIPMENT_LABELS: Record<string, string> = {
    full_gym: "Full gym",
    home_dumbbells_bands: "Home — dumbbells/bands",
    home_bodyweight_only: "Home — bodyweight only",
    none_travel: "None / traveling",
  };

  const scheduleParts: string[] = [];
  if (state.trainingDaysPerWeek) scheduleParts.push(`${state.trainingDaysPerWeek} days/week`);
  if ((state.preferredTrainingDays ?? []).length > 0) {
    scheduleParts.push((state.preferredTrainingDays ?? []).map((d) => DAY_LABELS[d] ?? d).join(", "));
  }
  if (state.sessionLengthMinutes) scheduleParts.push(`${state.sessionLengthMinutes} min sessions`);
  const scheduleValue = scheduleParts.length ? scheduleParts.join(" · ") : "Not set";

  const baselineParts: string[] = [];
  if (state.bodyFatPercent != null) baselineParts.push(`Body fat ${state.bodyFatPercent}%`);
  if (state.waistCm != null) baselineParts.push(`Waist ${state.waistCm}cm`);
  if (state.hipsCm != null) baselineParts.push(`Hips ${state.hipsCm}cm`);
  const hasBaselineInfo = baselineParts.length > 0;

  return (
    <WizardLayout
      step={5}
      total={5}
      caption={t("onboarding.summary.step")}
      title={t("onboarding.summary.title")}
      subtitle={t("onboarding.summary.subtitle")}
      onBack={() => navigation.goBack()}
      onNext={onConfirm}
      nextLabel="Confirm & Generate Plan"
      nextLoading={isSubmitting}
    >
      <Card>
        <SummaryRow label={t("onboarding.summary.goals")} value={state.goals.length ? state.goals.join(", ") : t("onboarding.summary.noneSelected")} />
        <SummaryRow label={t("onboarding.summary.experience")} value={state.trainingLevel ?? t("onboarding.summary.notSet")} />
        <SummaryRow label={t("onboarding.summary.schedule")} value={scheduleValue} />
        <SummaryRow
          label={t("onboarding.summary.equipment")}
          value={
            state.equipmentContext
              ? (EQUIPMENT_LABELS[state.equipmentContext] ?? state.equipmentContext)
              : t("onboarding.summary.notSet")
          }
        />
        <SummaryRow label={t("onboarding.summary.diet")} value={state.dietType ?? t("onboarding.summary.notSet")} />
        {state.allergens.length > 0 ? <SummaryRow label={t("onboarding.summary.allergens")} value={state.allergens.join(", ")} /> : null}
        {hasBaselineInfo ? <SummaryRow label={t("onboarding.summary.baseline")} value={baselineParts.join(" · ")} /> : null}
      </Card>

      <Card style={{ marginTop: spacing.md, borderColor: hasSafetyInfo ? colors.warning : colors.border }}>
        <Text style={{ ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs }}>{t("onboarding.summary.safety")}</Text>
        {hasSafetyInfo ? (
          <>
            {state.medicalConditions.length > 0 ? (
              <SummaryRow label={t("onboarding.summary.medicalConditions")} value={state.medicalConditions.join(", ")} />
            ) : null}
            {state.injuries.length > 0 ? <SummaryRow label={t("onboarding.summary.injuries")} value={state.injuries.join(", ")} /> : null}
            <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
              This app doesn't provide medical advice. Your plan will try to avoid unsafe exercises for what you
              reported, but always check with a doctor or physical therapist before starting a new program.
            </Text>
          </>
        ) : state.healthDataSkipped ? (
          <Text style={{ color: colors.textSecondary, ...typography.body }}>
            Health data skipped — your plan will treat your health as unknown and stay cautious.
          </Text>
        ) : (
          <Text style={{ color: colors.textSecondary, ...typography.body }}>{t("onboarding.summary.noneReported")}</Text>
        )}
      </Card>
    </WizardLayout>
  );
}
