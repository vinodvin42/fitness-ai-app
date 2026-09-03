import React, { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { logMeal } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "LogMeal">;

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

/**
 * Log Meal (fuel-02) — docs/mobile/03-screen-inventory.md §D: "search with
 * a barcode-scan shortcut, a take-photo option, a recent-foods list with
 * quick-add, saved/favorited meals, and a manual macro-entry card." Phase 1
 * scope: the manual macro-entry card only — search/barcode/photo/recent/
 * saved all need catalogs (FoodItem) or vision/camera integrations this
 * pass doesn't have (see docs/mobile/05-data-model.md §2, "NOT modeled
 * yet"). Quick-adding a known Recipe is Recipe Detail's "Log" action
 * instead of duplicated here.
 */
export function LogMealScreen({ route, navigation }: Props) {
  const queryClient = useQueryClient();
  const [mealType, setMealType] = useState<MealType>(route.params?.mealType ?? "breakfast");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && calories.trim().length > 0;

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
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>Manual entry</Text>
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
