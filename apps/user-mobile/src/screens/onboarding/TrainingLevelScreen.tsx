import React from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { LevelCard } from "../../components/WizardParts";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { spacing } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "TrainingLevel">;

// Figma "01 Onboarding / 06": four cards. The API only knows beginner |
// intermediate | advanced, so "Athlete" is sent as "advanced" (the card
// choice itself is kept locally in `fitnessLevelChoice`).
const LEVELS = [
  { choice: "beginner", value: "beginner", title: "Beginner", tag: "1-2 training sessions / week", description: "Just starting out on wellness roadmap" },
  { choice: "intermediate", value: "intermediate", title: "Intermediate", tag: "3-4 training sessions / week", description: "Active habits formed, comfortable standard" },
  { choice: "advanced", value: "advanced", title: "Advanced", tag: "5-6 training sessions / week", description: "Consistent intense performance metrics" },
  { choice: "athlete", value: "advanced", title: "Athlete", tag: "Daily progressive overload", description: "Competitive levels and high workloads" },
] as const;

/** docs/mobile/03-screen-inventory.md §A "Setup: Training Level" — restyled to Figma onboarding 06. */
export function TrainingLevelScreen({ navigation }: Props) {
  const { state, update, markScreenReached } = useOnboardingWizard();

  // Resumed drafts (or older builds) only have trainingLevel — fall back to it.
  const selectedChoice = state.fitnessLevelChoice ?? state.trainingLevel;

  return (
    <WizardLayout
      step={3}
      total={5}
      title="Your current fitness level"
      subtitle="Determines initial workout volume and recovery ratios"
      onBack={() => navigation.goBack()}
      onNext={() => {
        markScreenReached("Equipment");
        navigation.navigate("Equipment");
      }}
      nextDisabled={!state.trainingLevel}
    >
      <View style={{ gap: spacing.sm }}>
        {LEVELS.map((level) => (
          <LevelCard
            key={level.choice}
            title={level.title}
            tag={level.tag}
            description={level.description}
            selected={selectedChoice === level.choice}
            onPress={() => update({ trainingLevel: level.value, fitnessLevelChoice: level.choice })}
          />
        ))}
      </View>
    </WizardLayout>
  );
}
