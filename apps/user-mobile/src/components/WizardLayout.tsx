import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StepProgressBar } from "./StepProgressBar";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { colors, layout, radius, spacing, typography } from "../theme/tokens";

interface WizardLayoutProps {
  step: number;
  total: number;
  /** Overrides the "Step N of M" caption (used by the optional extra steps). */
  caption?: string;
  /** Overrides the progress-bar fill (0-1). */
  progress?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  /** Hide the pinned footer button (the screen renders its own inside the scroll content). */
  hideFooter?: boolean;
}

/**
 * Shared shell for the Setup wizard — Figma "01 Onboarding" frames 04-08:
 * thin progress bar + "Step N of M", a small square back chip, a large title
 * with a muted subtitle, then content and a single full-width Continue button.
 */
export function WizardLayout({
  step,
  total,
  caption,
  progress,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  nextLoading,
  hideFooter,
}: WizardLayoutProps) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <StepProgressBar step={step} total={total} caption={caption} progress={progress} />
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.backChip}>
            <Icon name="chevron-left" size={16} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.body}>{children}</View>
      </ScrollView>

      {hideFooter ? null : (
        <View style={styles.footer}>
          <Button
            label={nextLabel}
            onPress={onNext}
            disabled={nextDisabled}
            loading={nextLoading}
            mutedWhenDisabled
            style={styles.nextButton}
          />
        </View>
      )}
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
  content: { ...column, paddingHorizontal: layout.screenPadding, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  backChip: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  title: { ...typography.h1, fontSize: 24, color: colors.textPrimary, marginTop: spacing.md },
  subtitle: { ...typography.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 6 },
  body: { marginTop: spacing.md, gap: spacing.sm },
  footer: { ...column, paddingHorizontal: layout.screenPadding, paddingTop: spacing.sm, paddingBottom: spacing.md },
  nextButton: { width: "100%", borderRadius: radius.md },
});
