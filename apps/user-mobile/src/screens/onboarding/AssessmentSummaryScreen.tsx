import React, { useState } from "react";
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

  return (
    <WizardLayout
      step={6}
      total={6}
      label="Review"
      title="Review your assessment"
      subtitle="Check your answers before we build your plan."
      onBack={() => navigation.goBack()}
      onNext={onConfirm}
      nextLabel="Confirm & Generate Plan"
      nextLoading={isSubmitting}
    >
      <Card>
        <SummaryRow label="Goals" value={state.goals.length ? state.goals.join(", ") : "None selected"} />
        <SummaryRow label="Experience level" value={state.trainingLevel ?? "Not set"} />
        <SummaryRow label="Diet" value={state.dietType ?? "Not set"} />
        {state.allergens.length > 0 ? <SummaryRow label="Allergens" value={state.allergens.join(", ")} /> : null}
      </Card>

      <Card style={{ marginTop: spacing.md, borderColor: hasSafetyInfo ? colors.warning : colors.border }}>
        <Text style={{ ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs }}>Safety</Text>
        {hasSafetyInfo ? (
          <>
            {state.medicalConditions.length > 0 ? (
              <SummaryRow label="Medical conditions" value={state.medicalConditions.join(", ")} />
            ) : null}
            {state.injuries.length > 0 ? <SummaryRow label="Injuries" value={state.injuries.join(", ")} /> : null}
            <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
              This app doesn't provide medical advice. Your plan will try to avoid unsafe exercises for what you
              reported, but always check with a doctor or physical therapist before starting a new program.
            </Text>
          </>
        ) : (
          <Text style={{ color: colors.textSecondary, ...typography.body }}>None reported.</Text>
        )}
      </Card>
    </WizardLayout>
  );
}
