import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WizardLayout } from "../../components/WizardLayout";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { CheckboxField, OptionRow } from "../../components/WizardParts";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { BRAND_NAME } from "../../lib/brand";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Safety">;

const MEDICAL_CONDITIONS = ["None", "Diabetes", "Hypertension", "Heart Condition", "Asthma", "Thyroid", "PCOS/PCOD", "Prefer not to say"];
// "None" and "Prefer not to say" are answers, not conditions, and exclude every real condition.
const EXCLUSIVE = ["None", "Prefer not to say"];
const INJURIES = ["Head", "Shoulders", "Core/Back", "Knees", "Wrists", "Ankles"];

const isHeart = (c: string) => c.toLowerCase() === "heart condition";

/**
 * Figma "01 Onboarding / 08 Safety & Preferences" (docs/mobile/03-screen-
 * inventory.md §A "Setup: Safety" — a health-data collection point). Health
 * answers are only kept with the explicit consent checkbox; otherwise the user
 * continues without sharing (HealthDataSkip, Figma 09). The actual submit +
 * safety review happens on AssessmentSummary (BR-SAF-004).
 */
export function SafetyScreen({ navigation }: Props) {
  const { state, update, toggleListValue, markScreenReached } = useOnboardingWizard();

  const conditions = state.medicalConditions;
  const realConditions = conditions.filter((c) => !EXCLUSIVE.includes(c));
  const hasHealthData = realConditions.length > 0 || state.injuries.length > 0;
  const consented = state.healthDataConsent === true;
  const hasHeart = conditions.some(isHeart);

  const toggleCondition = (condition: string) => {
    if (EXCLUSIVE.includes(condition)) {
      update({ medicalConditions: conditions.includes(condition) ? [] : [condition] });
      return;
    }
    const without = conditions.filter((c) => !EXCLUSIVE.includes(c));
    update({
      medicalConditions: without.includes(condition) ? without.filter((c) => c !== condition) : [...without, condition],
    });
  };

  const onNext = () => {
    markScreenReached("Safety");
    update({ healthDataSkipped: false, healthDataConsent: hasHealthData ? true : undefined });
    navigation.navigate("AssessmentSummary");
  };

  return (
    <WizardLayout
      step={5}
      total={5}
      title="Safety & Preferences"
      subtitle="Help us keep your workouts safe. Your selections are used only to personalize guidance and intensity."
      onBack={() => navigation.goBack()}
      onNext={onNext}
      hideFooter
    >
      <View>
        <Text style={styles.h3}>Medical conditions</Text>
        <Text style={styles.help}>
          Select all that apply. None clears the others. This helps us adjust your workouts safely. If you choose a heart condition,
          we recommend consulting your doctor before starting exercise.
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        {MEDICAL_CONDITIONS.map((condition) => (
          <OptionRow
            key={condition}
            dense
            title={condition}
            trailing="checkbox"
            accessibilityRole="checkbox"
            selected={conditions.some((c) => c.toLowerCase() === condition.toLowerCase())}
            onPress={() => toggleCondition(condition)}
          />
        ))}
      </View>

      {hasHeart ? (
        <View style={styles.warning} accessibilityRole="alert">
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={styles.warnBadge}>
              <Icon name="alert-triangle" size={14} color="#1A1200" />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.warnTitle}>Heart Condition selected</Text>
              <Text style={styles.warnBody}>
                Please check with your doctor before starting a new exercise plan. If you give consent, {BRAND_NAME} can suggest
                lower-intensity sessions. Without consent, your selections are not saved or used.
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: 4 }}>
            <View style={styles.warnBadge}>
              <Icon name="check" size={13} color="#1A1200" strokeWidth={3} />
            </View>
            <Text style={[styles.warnBody, { flex: 1 }]}>Plan preview: lower-intensity cardio and fewer high-impact bursts.</Text>
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: spacing.sm }}>
        <Text style={styles.h3}>Any current injuries?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
          {INJURIES.map((injury) => (
            <Chip
              key={injury}
              label={injury}
              variant="outlined"
              selected={state.injuries.includes(injury)}
              onPress={() => toggleListValue("injuries", injury)}
            />
          ))}
        </View>
      </View>

      <View style={{ marginTop: spacing.sm }}>
        <Text style={styles.h3}>Health data consent</Text>
        <View style={[styles.consentCard, { marginTop: spacing.sm }]}>
          <CheckboxField
            checked={consented}
            onChange={(v) => update({ healthDataConsent: v })}
            label={`I consent to ${BRAND_NAME} using this health information only to adjust my workouts and provide safer guidance`}
          >
            <Text style={styles.consentText}>
              I consent to {BRAND_NAME} using this health information only to adjust my workouts and provide safer guidance.
            </Text>
          </CheckboxField>
          <Text style={styles.consentNote}>
            Optional. Without consent, your selected conditions and injuries are discarded and not stored or used.
          </Text>
          <Text style={styles.consentNote}>You can review and withdraw this consent later in Privacy & Data.</Text>
        </View>
      </View>

      <Button
        label="Continue"
        onPress={onNext}
        disabled={hasHealthData && !consented}
        mutedWhenDisabled
        style={{ marginTop: spacing.sm }}
      />

      <Pressable
        onPress={() => navigation.navigate("HealthDataSkip")}
        accessibilityRole="button"
        accessibilityLabel="Continue without sharing health data"
        style={{ alignItems: "center", paddingVertical: spacing.xs }}
      >
        <Text style={{ ...typography.label, fontSize: 12, color: colors.textPrimary }}>
          Continue without sharing health data
        </Text>
      </Pressable>
      <Text style={styles.footNote}>
        Selected conditions and injuries are discarded and not stored or used. The next screen offers a general gentle starter plan,
        not a condition-personalized or high-intensity prescription.
      </Text>
    </WizardLayout>
  );
}

const styles = StyleSheet.create({
  h3: { ...typography.h3, fontSize: 15, color: colors.textPrimary },
  help: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.textSecondary, marginTop: 4 },
  warning: {
    backgroundColor: "rgba(251,191,36,0.07)",
    borderColor: colors.warning,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  warnBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  warnTitle: { fontFamily: fonts.displayBold, fontSize: 13, color: colors.textPrimary },
  warnBody: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.textPrimary },
  consentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  consentText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textPrimary },
  consentNote: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.textSecondary },
  footNote: { fontFamily: fonts.body, fontSize: 10, lineHeight: 14, color: colors.textSecondary, textAlign: "center" },
});
