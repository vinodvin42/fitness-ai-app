import React from "react";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { SelectCard } from "../../components/SelectCard";
import { Stepper } from "../../components/Stepper";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { spacing } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "AboutYou">;

const GENDERS = ["male", "female", "other"] as const;

/** docs/mobile/03-screen-inventory.md §A "Setup: About You". */
export function AboutYouScreen({ navigation }: Props) {
  const { state, update, markScreenReached } = useOnboardingWizard();

  return (
    <WizardLayout
      step={1}
      total={6}
      label="About You"
      title="Tell us about yourself"
      subtitle="This helps us personalize your training and nutrition plans."
      onNext={() => {
        markScreenReached("Goals");
        navigation.navigate("Goals");
      }}
      nextDisabled={!state.gender}
    >
      <View style={{ gap: spacing.sm }}>
        {GENDERS.map((gender) => (
          <SelectCard
            key={gender}
            title={gender.charAt(0).toUpperCase() + gender.slice(1)}
            selected={state.gender === gender}
            onPress={() => update({ gender })}
          />
        ))}
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <Stepper label="Age" value={state.age} unit="yrs" step={1} min={13} max={100} onChange={(age) => update({ age })} />
        <Stepper
          label="Weight"
          value={state.weightKg}
          unit="kg"
          step={0.5}
          min={30}
          max={250}
          onChange={(weightKg) => update({ weightKg })}
        />
        <Stepper
          label="Height"
          value={state.heightCm}
          unit="cm"
          step={1}
          min={100}
          max={230}
          onChange={(heightCm) => update({ heightCm })}
        />
      </View>
    </WizardLayout>
  );
}
