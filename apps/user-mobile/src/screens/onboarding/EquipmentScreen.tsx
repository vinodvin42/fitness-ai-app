import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { SelectCard } from "../../components/SelectCard";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { spacing } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Equipment">;

const EQUIPMENT_OPTIONS = [
  { value: "full_gym", title: "Full gym", subtitle: "Machines, free weights, cardio — the whole setup" },
  { value: "home_dumbbells_bands", title: "Home — dumbbells/bands", subtitle: "A small set of dumbbells and/or resistance bands" },
  { value: "home_bodyweight_only", title: "Home — bodyweight only", subtitle: "No equipment, just your own bodyweight" },
  { value: "none_travel", title: "None / traveling", subtitle: "No regular access right now" },
] as const;

/**
 * Equipment/gym-context self-report (R1 Developer 1, 18 Sep 2026) — closes
 * the "no equipment/gym-context self-report of any kind" gap confirmed by
 * audit before this pass. Deliberately a plain, honest, user-reported
 * choice — NOT a `Gym`/partner/location entity, which stays Developer 3's
 * own future platform ownership (see apps/api's plans.service.ts top
 * comment). This IS read by Plan-Generation's selection prompt (see that
 * file's buildSelectionPrompt), so it's real, usable context from day one.
 */
export function EquipmentScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { state, update, markScreenReached } = useOnboardingWizard();

  return (
    <WizardLayout
      step={5}
      total={8}
      label={t("onboarding.equipment.step")}
      title={t("onboarding.equipment.title")}
      subtitle={t("onboarding.equipment.subtitle")}
      onBack={() => navigation.goBack()}
      onNext={() => {
        markScreenReached("FoodDiet");
        navigation.navigate("FoodDiet");
      }}
      nextDisabled={!state.equipmentContext}
    >
      <View style={{ gap: spacing.sm }}>
        {EQUIPMENT_OPTIONS.map((option) => (
          <SelectCard
            key={option.value}
            title={option.title}
            subtitle={option.subtitle}
            selected={state.equipmentContext === option.value}
            onPress={() => update({ equipmentContext: option.value })}
          />
        ))}
      </View>
    </WizardLayout>
  );
}
