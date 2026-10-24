import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { Chip } from "../../components/Chip";
import { OptionRow } from "../../components/WizardParts";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";
import { onboardingStep } from "../../navigation/onboardingSteps";
import { ALLERGENS, DIET_TYPES } from "../../lib/healthFoodOptions";

type Props = NativeStackScreenProps<OnboardingStackParamList, "FoodDiet">;

// Figma "01 Onboarding / 07". The same choices are offered after setup (Profile › Food preferences).

/** docs/mobile/03-screen-inventory.md §A "Setup: Food/Diet" — restyled to Figma onboarding 07. */
export function FoodDietScreen({ navigation }: Props) {
  const { state, update, markScreenReached } = useOnboardingWizard();

  // "None" is exclusive: picking it clears every allergen; picking an allergen clears "None".
  const toggleAllergen = (allergen: string) => {
    if (allergen === "None") {
      update({ allergens: state.allergens.includes("None") ? [] : ["None"] });
      return;
    }
    const without = state.allergens.filter((a) => a !== "None");
    update({ allergens: without.includes(allergen) ? without.filter((a) => a !== allergen) : [...without, allergen] });
  };

  return (
    <WizardLayout
      {...onboardingStep("FoodDiet")}
      title="Food Preferences"
      subtitle="Choose your diet type and any allergies we should avoid."
      onBack={() => navigation.goBack()}
      onNext={() => {
        markScreenReached("Safety");
        navigation.navigate("Safety");
      }}
      nextDisabled={!state.dietType}
    >
      <View style={{ gap: spacing.sm }}>
        {DIET_TYPES.map((diet) => (
          <OptionRow
            key={diet.value}
            title={diet.value}
            subtitle={diet.subtitle}
            trailing="radio"
            selected={state.dietType === diet.value}
            onPress={() => update({ dietType: diet.value })}
          />
        ))}
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Text style={{ ...typography.h3, fontSize: 15, color: colors.textPrimary }}>Any food allergies?</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.sm }}>
          Select one or more allergens. Choose None if you have no allergies.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {ALLERGENS.map((allergen) => (
            <Chip
              key={allergen}
              label={allergen}
              variant={allergen === "None" ? "solid" : "danger"}
              selected={state.allergens.includes(allergen)}
              onPress={() => toggleAllergen(allergen)}
            />
          ))}
        </View>
      </View>
    </WizardLayout>
  );
}
