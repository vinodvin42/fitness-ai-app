import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StepProgressBar } from "./StepProgressBar";
import { Button } from "./Button";
import { colors, layout, spacing, typography } from "../theme/tokens";

interface WizardLayoutProps {
  step: number;
  total: number;
  label: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
}

/**
 * Shared shell for the 5-step Setup wizard — docs/mobile/03-screen-inventory.md
 * §A describes this as "A linear, no-back-nav-bar flow with a 5-step
 * progress indicator from step 3 onward"; applied consistently from step 1
 * here since every step benefits from knowing where it sits in the flow.
 */
export function WizardLayout({
  step,
  total,
  label,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  nextLoading,
}: WizardLayoutProps) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <StepProgressBar step={step} total={total} label={label} />
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>

      <View style={styles.footer}>
        {onBack ? <Button label={t("wizard.back")} variant="secondary" onPress={onBack} style={styles.backButton} /> : null}
        <Button
          label={nextLabel}
          onPress={onNext}
          disabled={nextDisabled}
          loading={nextLoading}
          style={styles.nextButton}
        />
      </View>
    </SafeAreaView>
  );
}

const column = {
  width: "100%" as const,
  maxWidth: layout.maxContentWidth,
  alignSelf: "center" as const,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { ...column, paddingHorizontal: layout.screenPadding, paddingTop: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  content: { ...column, paddingHorizontal: layout.screenPadding, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  footer: {
    ...column,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backButton: { flex: 1 },
  nextButton: { flex: 2 },
});
