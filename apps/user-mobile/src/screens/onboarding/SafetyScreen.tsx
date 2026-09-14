import React from "react";
import { ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { Chip } from "../../components/Chip";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Safety">;

const MEDICAL_CONDITIONS = [
  "None",
  "Heart condition",
  "High blood pressure",
  "Diabetes",
  "Asthma",
  "Joint issues",
  "Pregnancy",
];
const INJURIES = ["Knee", "Shoulder", "Lower back", "Ankle", "Wrist", "Neck"];

/**
 * docs/mobile/03-screen-inventory.md §A "Setup: Safety" — flagged there as a
 * health-data collection point worth a privacy review; nothing extra is
 * done with this data yet beyond storing it (see OnboardingProfile in
 * apps/api/prisma/schema.prisma), which is itself the open item.
 *
 * U2 (15 Sep 2026): this used to submit the assessment directly on
 * "Finish Setup". It now just moves to AssessmentSummary — the actual
 * submit + safety review happens there, as its own distinct step (BR-SAF-004
 * "safety outcome separate" — see that screen's own comment).
 */
export function SafetyScreen({ navigation }: Props) {
  const { state, toggleListValue, markScreenReached } = useOnboardingWizard();

  const onNext = () => {
    markScreenReached("Safety");
    navigation.navigate("AssessmentSummary");
  };

  return (
    <WizardLayout
      step={5}
      total={6}
      label="Safety"
      title="Any medical conditions or injuries?"
      subtitle="This helps us avoid recommending unsafe exercises."
      onBack={() => navigation.goBack()}
      onNext={onNext}
      nextLabel="Review"
    >
      <Text style={{ ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs }}>
        Medical conditions
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {MEDICAL_CONDITIONS.map((condition) => (
            <Chip
              key={condition}
              label={condition}
              selected={state.medicalConditions.includes(condition)}
              onPress={() => toggleListValue("medicalConditions", condition)}
            />
          ))}
        </View>
      </ScrollView>

      <Text style={{ ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        Injuries
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {INJURIES.map((injury) => (
          <Chip
            key={injury}
            label={injury}
            selected={state.injuries.includes(injury)}
            onPress={() => toggleListValue("injuries", injury)}
          />
        ))}
      </View>
    </WizardLayout>
  );
}
