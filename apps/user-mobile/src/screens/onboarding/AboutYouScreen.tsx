import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { OptionRow } from "../../components/WizardParts";
import { DateOfBirthCard, MeasureCard, ageFromDob } from "../../components/AboutYouParts";
import { Stepper } from "../../components/Stepper";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "AboutYou">;

const GENDERS = [
  { value: "male", label: "Male", icon: "user" },
  { value: "female", label: "Female", icon: "venus" },
  { value: "other", label: "Other", icon: "circle-x" },
] as const;

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const MIN_AGE = 13;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Figma "01 Onboarding / 04 About You": gender as three full-width cards, a
 * Date-of-birth card with a computed Age badge, and weight/height cards with
 * unit toggles. Storage stays kg/cm whichever unit is displayed. The date of
 * birth is the source of truth for age (the under-18 gate uses the
 * DOB-derived age). The optional body-fat/waist/hips baseline (18 Sep 2026)
 * lives in a collapsed section below the Figma content.
 */
export function AboutYouScreen({ navigation }: Props) {
  const { state, update, markScreenReached } = useOnboardingWizard();
  const [weightUnit, setWeightUnit] = useState<0 | 1>(0); // 0 = kg, 1 = lbs
  const [heightUnit, setHeightUnit] = useState<0 | 1>(0); // 0 = cm, 1 = ft
  const [showBaseline, setShowBaseline] = useState(false);

  const age = state.dateOfBirth ? ageFromDob(state.dateOfBirth) : null;
  const tooYoung = age != null && age < MIN_AGE;

  const stepWeight = (dir: 1 | -1) => {
    const base = state.weightKg ?? 70;
    const next = weightUnit === 0 ? base + dir * 0.1 : base + dir * KG_PER_LB;
    update({ weightKg: round(clamp(next, 30, 250), 2) });
  };
  const stepHeight = (dir: 1 | -1) => {
    const base = state.heightCm ?? 170;
    const next = heightUnit === 0 ? base + dir : base + dir * CM_PER_IN;
    update({ heightCm: round(clamp(next, 100, 230), 1) });
  };

  const weightDisplay =
    state.weightKg == null ? null : weightUnit === 0 ? round(state.weightKg, 1).toFixed(1) : round(state.weightKg / KG_PER_LB, 1).toFixed(1);
  const heightDisplay = (() => {
    if (state.heightCm == null) return null;
    if (heightUnit === 0) return String(Math.round(state.heightCm));
    const totalIn = Math.round(state.heightCm / CM_PER_IN);
    return `${Math.floor(totalIn / 12)}'${totalIn % 12}"`;
  })();

  return (
    <WizardLayout
      step={1}
      total={5}
      title="About You"
      subtitle="Tell us about yourself for personalized recommendations."
      onNext={() => {
        // Under 18 (from the date of birth): the guardian gate comes first
        // (Figma 11). The resume target stays AboutYou until it is cleared.
        if (age != null && age < 18) {
          navigation.navigate("GuardianReview");
          return;
        }
        markScreenReached("Schedule");
        navigation.navigate("Schedule");
      }}
      nextDisabled={!state.gender || !state.dateOfBirth || tooYoung}
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
        error={tooYoung ? `You need to be at least ${MIN_AGE} to use this app.` : null}
      />

      <MeasureCard
        label="Weight"
        display={weightDisplay}
        placeholder={weightUnit === 0 ? "70.0" : "154.3"}
        units={["KG", "LBS"]}
        unitIndex={weightUnit}
        onUnitChange={setWeightUnit}
        onDecrement={() => stepWeight(-1)}
        onIncrement={() => stepWeight(1)}
      />
      <MeasureCard
        label="Height"
        display={heightDisplay}
        placeholder={heightUnit === 0 ? "170" : "5'7\""}
        units={["CM", "FT"]}
        unitIndex={heightUnit}
        onUnitChange={setHeightUnit}
        onDecrement={() => stepHeight(-1)}
        onIncrement={() => stepHeight(1)}
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
