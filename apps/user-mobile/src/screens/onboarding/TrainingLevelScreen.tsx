import React from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { LevelCard } from "../../components/WizardParts";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { spacing } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";
import { onboardingStep } from "../../navigation/onboardingSteps";

type Props = NativeStackScreenProps<OnboardingStackParamList, "TrainingLevel">;

// Figma "01 Onboarding / 06": four cards. The API only knows beginner |
// intermediate | advanced, so "Athlete" is sent as "advanced" (the card
// choice itself is kept locally in `fitnessLevelChoice`).
const LEVELS = [
  { choice: "beginner", value: "beginner", title: "Beginner", tag: "1-2 training sessions / week", description: "New to exercise, or starting again" },
  { choice: "intermediate", value: "intermediate", title: "Intermediate", tag: "3-4 training sessions / week", description: "You exercise regularly and know the basics" },
  { choice: "advanced", value: "advanced", title: "Advanced", tag: "5-6 training sessions / week", description: "You train hard on most days" },
  { choice: "athlete", value: "advanced", title: "Athlete", tag: "Trains every day", description: "You compete in a sport or train like an athlete" },
] as const;

/** docs/mobile/03-screen-inventory.md §A "Setup: Training Level" — restyled to Figma onboarding 06. */
export function TrainingLevelScreen({ navigation }: Props) {
  const { state, update, markScreenReached } = useOnboardingWizard();

  // Resumed drafts (or older builds) only have trainingLevel — fall back to it.
  const selectedChoice = state.fitnessLevelChoice ?? state.trainingLevel;

  return (
    <WizardLayout
      {...onboardingStep("TrainingLevel")}
      title="Your current fitness level"
      subtitle="This sets how much you train at first and how much rest you get between workouts."
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
