import React from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { SelectCard } from "../../components/SelectCard";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { spacing } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "TrainingLevel">;

const LEVELS = [
  { value: "beginner", title: "New to training", subtitle: "Little to no structured training experience" },
  { value: "beginner", title: "Beginner", subtitle: "Training on and off for under a year" },
  { value: "intermediate", title: "Intermediate", subtitle: "Consistent training for 1–3 years" },
  { value: "advanced", title: "Advanced", subtitle: "Structured training for 3+ years" },
] as const;

/** docs/mobile/03-screen-inventory.md §A "Setup: Training Level" — 4 experience-level cards. */
export function TrainingLevelScreen({ navigation }: Props) {
  const { state, update, markScreenReached } = useOnboardingWizard();

  return (
    <WizardLayout
      step={3}
      total={6}
      label="Training Level"
      title="What's your experience level?"
      onBack={() => navigation.goBack()}
      onNext={() => {
        markScreenReached("FoodDiet");
        navigation.navigate("FoodDiet");
      }}
      nextDisabled={!state.trainingLevel}
    >
      <View style={{ gap: spacing.sm }}>
        {LEVELS.map((level, i) => (
          <SelectCard
            key={`${level.value}-${i}`}
            title={level.title}
            subtitle={level.subtitle}
            selected={state.trainingLevel === level.value}
            onPress={() => update({ trainingLevel: level.value })}
          />
        ))}
      </View>
    </WizardLayout>
  );
}
