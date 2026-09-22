import React, { useEffect, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { createFoodEstimate, logMeal } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "LogMeal">;

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

/**
 * Log Meal (fuel-02) — docs/mobile/03-screen-inventory.md §D: "search with
 * a barcode-scan shortcut, a take-photo option, a recent-foods list with
 * quick-add, saved/favorited meals, and a manual macro-entry card." Phase 1
 * scope: a manual macro-entry card, plus (U4, 15 Sep 2026) a real
 * AI-estimate card — describe what you ate in a sentence, the AI guesses
 * calories/macros, and Confirm Food Estimate (next screen) is the real
 * BR-DAT-003 gate before anything is actually logged. Search/barcode/photo/
 * recent/saved all still need catalogs (FoodItem) or vision/camera
 * integrations this pass doesn't have (see docs/mobile/05-data-model.md
 * §2, "NOT modeled yet"). Quick-adding a known Recipe is Recipe Detail's
 * "Log" action instead of duplicated here.
 *
 * Manual entry (below) is deliberately NOT routed through the same
 * confirm/edit gate — see nutrition.service.ts's own doc comment for why:
 * the user is typing exact numbers they're asserting as true, not
 * reviewing an AI guess, so there's no "estimate" for BR-DAT-003 to apply
 * to. Logging it stays a single step, same as before this pass.
 *
 * Barcode scan (R2 Wave, 22 Sep 2026) reuses this SAME manual-entry card
 * rather than being a third, parallel logging path: Barcode Scanner
 * navigates back here with a `barcodePrefill` param (a real Open Food
 * Facts result via the backend proxy — see api/nutrition.ts's
 * lookupBarcode), and the effect below just pre-fills the manual fields
 * from it, exactly as if the user had typed them. Submitting still goes
 * through the exact same onSubmit -> POST /meal-logs below.
 */
export function LogMealScreen({ route, navigation }: Props) {
  const queryClient = useQueryClient();
  const [mealType, setMealType] = useState<MealType>(route.params?.mealType ?? "breakfast");
  const [description, setDescription] = useState("");
  const [isEstimating, setIsEstimating] = useState(false);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannedLabel, setScannedLabel] = useState<string | null>(null);

  const barcodePrefill = route.params?.barcodePrefill;
  useEffect(() => {
    if (!barcodePrefill) return;
    setName(barcodePrefill.brand ? `${barcodePrefill.name} (${barcodePrefill.brand})` : barcodePrefill.name);
    setCalories(String(barcodePrefill.calories));
    setProtein(String(barcodePrefill.proteinG));
    setCarbs(String(barcodePrefill.carbsG));
    setFat(String(barcodePrefill.fatG));
    setScannedLabel(
      `From barcode scan — ${barcodePrefill.basis === "serving" ? `per serving${barcodePrefill.servingSize ? ` (${barcodePrefill.servingSize})` : ""}` : "per 100g"}. Review before logging.`,
    );
    // Consume the param once so re-focusing this screen doesn't re-apply it
    // over edits the user has since made. Deliberately depends only on
    // `barcodePrefill` (not `navigation`, a stable ref that would be a
    // false trigger anyway) — this effect's whole point is "run again only
    // when a NEW scan result arrives".
    navigation.setParams({ barcodePrefill: undefined });
  }, [barcodePrefill]);

  const canSubmit = name.trim().length > 0 && calories.trim().length > 0;
  const canEstimate = description.trim().length > 0;

  const onEstimate = async () => {
    if (!canEstimate) return;
    setIsEstimating(true);
    try {
      const estimate = await createFoodEstimate({ mealType, description: description.trim() });
      if (estimate.status === "insufficient_context") {
        Alert.alert(
          "Couldn't estimate that",
          estimate.failureReason ?? "Try describing it differently, or use manual entry below.",
        );
        return;
      }
      navigation.navigate("ConfirmFoodEstimate", { estimate });
    } catch (err) {
      Alert.alert("Couldn't estimate this meal", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsEstimating(false);
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await logMeal({
        mealType,
        name: name.trim(),
        calories: parseInt(calories, 10),
        proteinG: protein ? parseInt(protein, 10) : undefined,
        carbsG: carbs ? parseInt(carbs, 10) : undefined,
        fatG: fat ? parseInt(fat, 10) : undefined,
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
    <ScreenContainer title="Log Meal">
      <Card>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>Meal</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {MEAL_TYPES.map((mt) => (
            <Chip key={mt} label={MEAL_LABELS[mt]} selected={mealType === mt} onPress={() => setMealType(mt)} />
          ))}
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Describe what you ate</Text>
        <Text style={{ color: colors.textMuted, ...typography.caption, marginBottom: spacing.sm }}>
          AI estimates the calories and macros — you'll review and can edit before it's logged.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 2 eggs and a slice of toast"
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
        />
        <Button
          label="Estimate"
          variant="secondary"
          onPress={onEstimate}
          loading={isEstimating}
          disabled={!canEstimate}
          style={{ marginTop: spacing.sm, height: 44 }}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.textSecondary }}>Manual entry</Text>
          <Button
            label="Scan Barcode"
            variant="secondary"
            onPress={() => navigation.navigate("BarcodeScanner", { mealType })}
            style={{ height: 36, paddingHorizontal: spacing.md }}
          />
        </View>
        {scannedLabel ? (
          <Text style={{ color: colors.accent, ...typography.caption, marginBottom: spacing.sm }}>{scannedLabel}</Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="What did you eat?"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={[styles.input, { marginTop: spacing.sm }]}
          placeholder="Calories"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          value={calories}
          onChangeText={setCalories}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Protein (g)"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={protein}
            onChangeText={setProtein}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Carbs (g)"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={carbs}
            onChangeText={setCarbs}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Fat (g)"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={fat}
            onChangeText={setFat}
          />
        </View>
      </Card>

      <Button label="Log Meal" onPress={onSubmit} loading={isSubmitting} disabled={!canSubmit} style={{ marginTop: spacing.lg }} />
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
