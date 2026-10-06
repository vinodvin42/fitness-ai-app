import React from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StateLayout, InfoCard } from "../../components/StatePanels";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "HealthDataSkip">;

/**
 * Onboarding 09 "Continue without health data" — built from the task
 * description (Figma MCP was unavailable), reusing StateLayout. Choosing to
 * skip clears any medical/injury selections locally and sets
 * `healthDataSkipped`, which the server persists as
 * OnboardingProfile.healthDataSkippedAt and the plan generator reads as
 * "safety context unknown" (cautious prompt).
 */
export function HealthDataSkipScreen({ navigation }: Props) {
  const { update, markScreenReached } = useOnboardingWizard();

  const onSkip = () => {
    update({ medicalConditions: [], injuries: [], healthDataSkipped: true });
    markScreenReached("Safety");
    navigation.navigate("AssessmentSummary");
  };

  return (
    <StateLayout
      flowLabel="Setup / Health data"
      flowIcon="shield-check"
      title="Continue without health data?"
      description="You can skip the medical and injury questions. Your plan will still be built, but we'll treat your health as unknown."
      onBack={() => navigation.goBack()}
      footnote="You can add this later from your profile. This isn't medical advice."
      actions={[
        { label: "Continue without health data", onPress: onSkip },
        { label: "Go back and answer", variant: "secondary", onPress: () => navigation.goBack() },
      ]}
    >
      <InfoCard
        tone="accent"
        title="What changes"
        body="Your plan will be more generic and lean towards lower-intensity options, because we can't tailor it around conditions or injuries."
      />
      <InfoCard
        tone="danger"
        title="Safety caution"
        body="We can't steer you away from exercises that may not suit a condition or injury. If you have any, check with a doctor or physical therapist before training."
      />
      <InfoCard title="What we store" body="We record that you chose to skip. No medical details are saved." />
    </StateLayout>
  );
}
