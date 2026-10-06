import React from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { Chip } from "../../components/Chip";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { spacing } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Goals">;

const GOALS = [
  "Lose Weight",
  "Build Muscle",
  "Improve Endurance",
  "Stay Active",
  "Increase Flexibility",
  "Better Sleep",
  "Reduce Stress",
  "Sports Performance",
];

/** docs/mobile/03-screen-inventory.md §A "Setup: Goals" — multi-select chip grid. */
export function GoalsScreen({ navigation }: Props) {
  const { state, toggleListValue, markScreenReached } = useOnboardingWizard();

  return (
    <WizardLayout
      step={2}
      total={5}
      title="What are your goals?"
      subtitle="Select all that apply to fine-tune your tracking dashboards."
      onBack={() => navigation.goBack()}
      onNext={() => {
        markScreenReached("TrainingLevel");
        navigation.navigate("TrainingLevel");
      }}
      nextDisabled={state.goals.length === 0}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {GOALS.map((goal) => (
          <Chip
            key={goal}
            label={goal}
            selected={state.goals.includes(goal)}
            showCheck
            onPress={() => toggleListValue("goals", goal)}
          />
        ))}
      </View>
    </WizardLayout>
  );
}
