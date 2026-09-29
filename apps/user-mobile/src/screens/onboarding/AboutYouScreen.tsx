import React from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { SelectCard } from "../../components/SelectCard";
import { Stepper } from "../../components/Stepper";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "AboutYou">;

const GENDERS = ["male", "female", "other"] as const;

/**
 * docs/mobile/03-screen-inventory.md §A "Setup: About You". 18 Sep 2026:
 * gained a real, clearly-optional Baseline measurements section
 * (body-fat%/waist/hips) — the broader Baseline/measurements gap this pass
 * closes, added here rather than as its own screen since it's a natural
 * extension of the body stats this screen already collects. Persisted as a
 * real BodyMeasurement row (not new OnboardingProfile columns) — see
 * users.service.ts#upsertOnboardingProfile's own comment.
 */
export function AboutYouScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { state, update, markScreenReached } = useOnboardingWizard();

  return (
    <WizardLayout
      step={1}
      total={8}
      label={t("onboarding.aboutYou.step")}
      title={t("onboarding.aboutYou.title")}
      subtitle={t("onboarding.aboutYou.subtitle")}
      onNext={() => {
        markScreenReached("Schedule");
        navigation.navigate("Schedule");
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
        <Stepper label={t("onboarding.aboutYou.age")} value={state.age} unit="yrs" step={1} min={13} max={100} onChange={(age) => update({ age })} />
        <Stepper
          label={t("onboarding.aboutYou.weight")}
          value={state.weightKg}
          unit="kg"
          step={0.5}
          min={30}
          max={250}
          onChange={(weightKg) => update({ weightKg })}
        />
        <Stepper
          label={t("onboarding.aboutYou.height")}
          value={state.heightCm}
          unit="cm"
          step={1}
          min={100}
          max={230}
          onChange={(heightCm) => update({ heightCm })}
        />
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <Text style={{ ...typography.h2, color: colors.textPrimary }}>{t("onboarding.aboutYou.baseline")}</Text>
        <Text style={{ ...typography.meta, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xs }}>
          Optional — skip anything you don't know precisely. Leave a value at "–" to leave it out.
        </Text>
        <Stepper
          label={t("onboarding.aboutYou.bodyFat")}
          value={state.bodyFatPercent}
          unit="%"
          step={0.5}
          min={3}
          max={60}
          onChange={(bodyFatPercent) => update({ bodyFatPercent })}
        />
        <Stepper
          label={t("onboarding.aboutYou.waist")}
          value={state.waistCm}
          unit="cm"
          step={1}
          min={40}
          max={200}
          onChange={(waistCm) => update({ waistCm })}
        />
        <Stepper
          label={t("onboarding.aboutYou.hips")}
          value={state.hipsCm}
          unit="cm"
          step={1}
          min={40}
          max={200}
          onChange={(hipsCm) => update({ hipsCm })}
        />
      </View>
    </WizardLayout>
  );
}
