import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StepProgressBar } from "./StepProgressBar";
import { Button } from "./Button";
import { colors, spacing, typography } from "../theme/tokens";

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

/** Shared shell for the Coach Onboarding wizard — copied near-verbatim from apps/user-mobile's WizardLayout. */
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
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <StepProgressBar step={step} total={total} label={label} />
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>

      <View style={styles.footer}>
        {onBack ? <Button label="Back" variant="secondary" onPress={onBack} style={styles.backButton} /> : null}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backButton: { flex: 1 },
  nextButton: { flex: 2 },
});
