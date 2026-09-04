import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { fetchRecipeDetail } from "../../api/programs";
import { logMeal } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "RecipeDetail">;

/**
 * Recipe Detail (fuel-05) — docs/mobile/03-screen-inventory.md §D: "hero
 * image, macro chips, a checkable ingredients list, numbered steps, and a
 * Log action." **4 Sep 2026: the hero image is real** — `Recipe.imageUrl`
 * was added to the schema and populated for every seeded recipe in the
 * same pass. Still not modeled, and so still not shown: the ingredients
 * list and numbered steps, which have no backing field on Recipe at all
 * (it carries name/mealType/calories/macros/prepTime/tags/imageUrl — see
 * apps/api/prisma/schema.prisma). Logging copies the recipe's macros into
 * a new MealLog server-side (POST /meal-logs with recipeId).
 */
export function RecipeDetailScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const queryClient = useQueryClient();
  const [isLogging, setIsLogging] = useState(false);
  const { data: recipe, isLoading, isError, refetch } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => fetchRecipeDetail(recipeId),
  });

  const onLog = async () => {
    if (!recipe) return;
    setIsLogging(true);
    try {
      await logMeal({ mealType: recipe.mealType, recipeId: recipe.id });
      await queryClient.invalidateQueries({ queryKey: ["mealLogs", "today"] });
      navigation.navigate("FuelDashboard");
    } catch (err) {
      Alert.alert("Couldn't log this meal", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsLogging(false);
    }
  };

  if (isError) {
    return (
      <ScreenContainer title="Recipe">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !recipe) {
    return (
      <ScreenContainer title="Recipe">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={recipe.name}>
      {recipe.imageUrl ? (
        <Image
          source={{ uri: recipe.imageUrl }}
          style={{
            width: "100%",
            height: 180,
            borderRadius: radius.card,
            backgroundColor: colors.surfaceRaised,
            marginBottom: spacing.md,
          }}
          resizeMode="cover"
        />
      ) : null}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radius.md,
              backgroundColor: "rgba(236,72,153,0.16)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="apple" size={26} color={colors.pink} />
          </View>
          <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            <Pill label={recipe.mealType} tone="success" />
            <Pill label={`${recipe.prepTimeMinutes} min`} icon="clock" />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <MacroChip label="Calories" value={`${recipe.calories}`} color={colors.orange} />
          <MacroChip label="Protein" value={`${recipe.proteinG}g`} color={colors.success} />
          <MacroChip label="Carbs" value={`${recipe.carbsG}g`} color={colors.warning} />
          <MacroChip label="Fat" value={`${recipe.fatG}g`} color={colors.pink} />
        </View>
      </Card>

      {recipe.tags.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {recipe.tags.map((tag) => (
            <Pill key={tag} label={tag} />
          ))}
        </View>
      ) : null}

      <Button label="Log this meal" onPress={onLog} loading={isLogging} style={{ marginTop: spacing.sm }} />
    </ScreenContainer>
  );
}

function MacroChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color, fontSize: 18, fontFamily: fonts.mono }}>{value}</Text>
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
    </View>
  );
}
