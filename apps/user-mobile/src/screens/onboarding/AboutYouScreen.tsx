import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { OptionRow } from "../../components/WizardParts";
import { DateOfBirthCard, HeightCard, WeightCard, ageFromDob } from "../../components/AboutYouParts";
import { Stepper } from "../../components/Stepper";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";
import { onboardingStep } from "../../navigation/onboardingSteps";

type Props = NativeStackScreenProps<OnboardingStackParamList, "AboutYou">;

const GENDERS = [
  { value: "male", label: "Male", icon: "user" },
  { value: "female", label: "Female", icon: "venus" },
  { value: "other", label: "Other", icon: "circle-x" },
] as const;

/**
 * Figma "01 Onboarding / 04 About You": gender as three full-width cards, a
 * Date-of-birth card with a computed Age badge, and weight/height cards with
 * unit toggles where the value is typed (the -/+ buttons are only helpers).
 * Storage stays kg/cm whichever unit is displayed. The date of
 * birth is the source of truth for age; there is no minimum age. The optional body-fat/waist/hips baseline (18 Sep 2026)
 * lives in a collapsed section below the Figma content.
 */
export function AboutYouScreen({ navigation }: Props) {
  const { state, update, markScreenReached } = useOnboardingWizard();
  const [weightUnit, setWeightUnit] = useState<0 | 1>(0); // 0 = kg, 1 = lbs
  const [heightUnit, setHeightUnit] = useState<0 | 1>(0); // 0 = cm, 1 = ft
  const [showBaseline, setShowBaseline] = useState(false);

  return (
    <WizardLayout
      {...onboardingStep("AboutYou")}
      title="About You"
      subtitle="Tell us about yourself for personalized recommendations."
      onNext={() => {
        // No age limit (owner decision, 15 Oct 2026): anyone can continue.
        markScreenReached("Schedule");
        navigation.navigate("Schedule");
      }}
      nextDisabled={!state.gender || !state.dateOfBirth}
    >
      <View style={{ gap: spacing.sm }}>
        {GENDERS.map((g) => (
          <OptionRow
            key={g.value}
            title={g.label}
            icon={g.icon}
            selected={state.gender === g.value}
            onPress={() => update({ gender: g.value })}
          />
        ))}
      </View>

      <DateOfBirthCard
        value={state.dateOfBirth}
        onChange={(dateOfBirth) => update({ dateOfBirth, age: ageFromDob(dateOfBirth) ?? undefined })}
      />

      <WeightCard
        valueKg={state.weightKg}
        onChange={(weightKg) => update({ weightKg })}
        unitIndex={weightUnit}
        onUnitChange={setWeightUnit}
      />
      <HeightCard
        valueCm={state.heightCm}
        onChange={(heightCm) => update({ heightCm })}
        unitIndex={heightUnit}
        onUnitChange={setHeightUnit}
      />

      <Pressable
        onPress={() => setShowBaseline((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showBaseline }}
        style={{ paddingVertical: spacing.xs }}
      >
        <Text style={{ ...typography.label, color: colors.textSecondary }}>
          {showBaseline ? "Hide" : "Add"} baseline measurements (optional)
        </Text>
      </Pressable>
      {showBaseline ? (
        <View>
          <Text style={{ ...typography.meta, color: colors.textMuted, marginBottom: spacing.xs }}>
            Skip anything you don't know precisely. Leave a value at "–" to leave it out.
          </Text>
          <Stepper
            label="Body fat %"
            value={state.bodyFatPercent}
            unit="%"
            step={0.5}
            min={3}
            max={60}
            onChange={(bodyFatPercent) => update({ bodyFatPercent })}
          />
          <Stepper label="Waist" value={state.waistCm} unit="cm" step={1} min={40} max={200} onChange={(waistCm) => update({ waistCm })} />
          <Stepper label="Hips" value={state.hipsCm} unit="cm" step={1} min={40} max={200} onChange={(hipsCm) => update({ hipsCm })} />
        </View>
      ) : null}
    </WizardLayout>
  );
}
