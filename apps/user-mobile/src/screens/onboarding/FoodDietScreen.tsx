import React from "react";
import { ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { Chip } from "../../components/Chip";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "FoodDiet">;

const DIET_TYPES = ["Vegetarian", "Non-Vegetarian", "Vegan", "Eggetarian", "Pescatarian", "Keto"];
const ALLERGENS = [
  "Nuts",
  "Dairy",
  "Gluten",
  "Shellfish",
  "Soy",
  "Eggs",
  "Fish",
  "Sesame",
  "None",
];

/** docs/mobile/03-screen-inventory.md §A "Setup: Food/Diet". */
export function FoodDietScreen({ navigation }: Props) {
  const { state, update, toggleListValue, markScreenReached } = useOnboardingWizard();

  return (
    <WizardLayout
      step={6}
      total={8}
      label="Food/Diet"
      title="Your diet preferences"
      onBack={() => navigation.goBack()}
      onNext={() => {
        markScreenReached("Safety");
        navigation.navigate("Safety");
      }}
      nextDisabled={!state.dietType}
    >
      <Text style={{ ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs }}>Diet type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {DIET_TYPES.map((diet) => (
            <Chip key={diet} label={diet} selected={state.dietType === diet} onPress={() => update({ dietType: diet })} />
          ))}
        </View>
      </ScrollView>

      <Text style={{ ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        Allergens
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {ALLERGENS.map((allergen) => (
          <Chip
            key={allergen}
            label={allergen}
            selected={state.allergens.includes(allergen)}
            onPress={() => toggleListValue("allergens", allergen)}
          />
        ))}
      </View>
    </WizardLayout>
  );
}
