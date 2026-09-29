import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { confirmFoodEstimate } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "ConfirmFoodEstimate">;

/**
 * Confirm Food Estimate (U4, 15 Sep 2026) — the real BR-DAT-003 gate:
 * "estimated data is not actual until confirmed/edited where required."
 * Nothing from Log Meal's AI-estimate card is written to MealLog (the
 * dashboard's real, logged-fact table) until the user acts here — every
 * field below is pre-filled from the AI's guess but fully editable, and
 * whether the resulting MealLog is tagged "confirmed" or "edited" is
 * decided server-side (nutrition.service.ts's confirmFoodEstimate) by
 * comparing what's actually submitted against the estimate's own original
 * values, not by which button was pressed — so an unedited "Log it" tap
 * and an edited one both go through the exact same call.
 */
export function ConfirmFoodEstimateScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { estimate } = route.params;
  const queryClient = useQueryClient();
  const [name, setName] = useState(estimate.name ?? "");
  const [calories, setCalories] = useState(String(estimate.calories ?? ""));
  const [protein, setProtein] = useState(String(estimate.proteinG ?? 0));
  const [carbs, setCarbs] = useState(String(estimate.carbsG ?? 0));
  const [fat, setFat] = useState(String(estimate.fatG ?? 0));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && calories.trim().length > 0;

  const onLogIt = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await confirmFoodEstimate(estimate.id, {
        name: name.trim(),
        calories: parseInt(calories, 10) || 0,
        proteinG: parseInt(protein, 10) || 0,
        carbsG: parseInt(carbs, 10) || 0,
        fatG: parseInt(fat, 10) || 0,
      });
      await queryClient.invalidateQueries({ queryKey: ["mealLogs", "today"] });
      navigation.navigate("FuelDashboard");
    } catch (err) {
      Alert.alert("Couldn't log this meal", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer title={t("fuel.confirmEstimate.title")} subtitle={`“${estimate.description}”`}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 18 }}>✨</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("fuel.confirmEstimate.banner")}</Text>
        </View>
        <Text style={{ color: colors.textMuted, ...typography.caption, marginBottom: spacing.md }}>
          {t("fuel.confirmEstimate.caveat")}
        </Text>

        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{t("fuel.logMeal.whatDidYouEat")}</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.textMuted} />

        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs }}>{t("fuel.logMeal.calories")}</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={calories}
          onChangeText={setCalories}
          placeholderTextColor={colors.textMuted}
        />

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{t("fuel.logMeal.proteinG")}</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={protein} onChangeText={setProtein} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{t("fuel.logMeal.carbsG")}</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={carbs} onChangeText={setCarbs} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{t("fuel.logMeal.fatG")}</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={fat} onChangeText={setFat} />
          </View>
        </View>
      </Card>

      <Button label={t("fuel.confirmEstimate.logIt")} onPress={onLogIt} loading={isSubmitting} disabled={!canSubmit} style={{ marginTop: spacing.lg }} />
      <Button
        label={t("common.cancel")}
        variant="secondary"
        onPress={() => navigation.goBack()}
        style={{ marginTop: spacing.sm }}
      />
    </ScreenContainer>
  );
}

const styles = {
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
  },
} as const;
