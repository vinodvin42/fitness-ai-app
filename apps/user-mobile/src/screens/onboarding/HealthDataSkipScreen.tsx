import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StateLayout, InfoCard } from "../../components/StatePanels";
import { Icon } from "../../components/Icon";
import { useOnboardingWizard } from "../../context/OnboardingWizardContext";
import { useAuth } from "../../context/AuthContext";
import { BRAND_NAME } from "../../lib/brand";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "HealthDataSkip">;

function StarterRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text style={{ width: 92, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 }}>{label}</Text>
      <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{value}</Text>
    </View>
  );
}

/**
 * Figma "01 Onboarding / 09 Start gently, on your terms" — shown after "Continue
 * without sharing health data" on Safety & Preferences. Choosing the gentle
 * starter clears any medical/injury selections locally and sets
 * `healthDataSkipped`, which the server persists as
 * OnboardingProfile.healthDataSkippedAt and the plan generator reads as
 * "safety context unknown" (cautious prompt). "Review consent choice" goes back.
 */
export function HealthDataSkipScreen({ navigation }: Props) {
  const { update, markScreenReached } = useOnboardingWizard();
  const { user } = useAuth();
  const { colors: theme } = useTheme();
  const firstName = user?.fullName?.trim().split(/\s+/)[0];

  const onChoose = () => {
    update({ medicalConditions: [], injuries: [], healthDataSkipped: true, healthDataConsent: false });
    markScreenReached("Safety");
    navigation.navigate("AssessmentSummary");
  };

  return (
    <StateLayout
      showBrand
      flowLabel="Consent / Onboarding outcome"
      flowIcon="shield-check"
      title="Start gently, on your terms"
      description={`${firstName ? `${firstName}, you` : "You"} continued without sharing health data. Your selected conditions and injuries have been discarded, not saved or used.`}
      onBack={() => navigation.goBack()}
      footnote="Optional general activity, not a personalized prescription."
      actions={[
        { label: "Choose gentle starter", onPress: onChoose },
        { label: "Review consent choice", variant: "secondary", onPress: () => navigation.goBack() },
      ]}
    >
      <InfoCard
        tone="accent"
        title="Health-data personalization is off"
        body="We won't build a condition-personalized or high-intensity plan. This starter is a general gentle option, not an assessment of what is safe for you."
      />
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Icon name="leaf" size={16} color={theme.accent} />
          <Text style={{ ...typography.h3, fontSize: 14, color: colors.textPrimary }}>General gentle starter</Text>
        </View>
        <StarterRow label="Ease in" value="Comfortable, easy movement" />
        <StarterRow label="Take a pause" value="Gentle guided breathing" />
        <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 }}>
          Choose your own pace. Rest or stop at any time; there's no target to push through.
        </Text>
      </View>
      <InfoCard
        tone="warning"
        title="Check with your doctor"
        body={`If you have a medical condition, injury or concerns, consult your doctor before starting a new exercise plan. Stop if you feel pain, dizziness or unwell. ${BRAND_NAME} does not provide medical advice.`}
      />
    </StateLayout>
  );
}
