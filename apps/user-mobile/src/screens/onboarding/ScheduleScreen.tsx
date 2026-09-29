import React from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { Chip } from "../../components/Chip";
import { Stepper } from "../../components/Stepper";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Schedule">;

const DAYS: Array<{ value: string; label: string }> = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const SESSION_LENGTHS = [30, 45, 60, 90];

/**
 * Availability/Schedule (R1 Developer 1, 18 Sep 2026) — closes the "no
 * Availability/schedule screen or field anywhere" gap confirmed by audit
 * before this pass. Real, honest self-report only: how many days/week and
 * roughly which days the user can train, plus a rough session-length
 * preference. Deliberately does NOT drive any scheduling/program-layout
 * logic — see OnboardingProfile.trainingDaysPerWeek's own schema.prisma
 * comment for why that's this pass's job to collect, not to act on.
 */
export function ScheduleScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { state, update, toggleListValue, markScreenReached } = useOnboardingWizard();

  return (
    <WizardLayout
      step={2}
      total={8}
      label={t("onboarding.schedule.step")}
      title={t("onboarding.schedule.title")}
      subtitle={t("onboarding.schedule.subtitle")}
      onBack={() => navigation.goBack()}
      onNext={() => {
        markScreenReached("Goals");
        navigation.navigate("Goals");
      }}
    >
      <Stepper
        label={t("onboarding.schedule.daysPerWeek")}
        value={state.trainingDaysPerWeek}
        unit="days"
        step={1}
        min={1}
        max={7}
        onChange={(trainingDaysPerWeek) => update({ trainingDaysPerWeek })}
      />

      <Text style={{ ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        {t("onboarding.schedule.whichDays")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {DAYS.map((day) => (
          <Chip
            key={day.value}
            label={day.label}
            selected={(state.preferredTrainingDays ?? []).includes(day.value)}
            onPress={() => toggleListValue("preferredTrainingDays", day.value)}
          />
        ))}
      </View>

      <Text style={{ ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        {t("onboarding.schedule.sessionLength")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {SESSION_LENGTHS.map((minutes) => (
          <Chip
            key={minutes}
            label={`${minutes} min`}
            selected={state.sessionLengthMinutes === minutes}
            onPress={() => update({ sessionLengthMinutes: minutes })}
          />
        ))}
      </View>
    </WizardLayout>
  );
}
