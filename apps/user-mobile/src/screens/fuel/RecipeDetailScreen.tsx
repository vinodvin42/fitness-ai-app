import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { fetchRecipeDetail } from "../../api/programs";
import { logMeal } from "../../api/nutrition";
import { useSavedRecipes } from "../../api/savedRecipes";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "RecipeDetail">;

/**
 * Recipe Detail (Figma Fuel 05): hero photo with a back arrow, name, macro
 * chips, "Ingredients (n)" checklist, "Instructions" with "Step n" labels and
 * a pinned "Log This Meal". Ingredients and steps come from the Recipe row
 * (`ingredients` / `instructions`) and are authored for only some recipes;
 * where there are none, those sections are omitted rather than invented. The
 * ticks on the checklist are a local "got it" aid, not saved. Logging copies
 * the recipe's macros into a new MealLog server-side (POST /meal-logs with
 * recipeId).
 */
export function RecipeDetailScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const queryClient = useQueryClient();
  const { colors: theme } = useTheme();
  const [isLogging, setIsLogging] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const saved = useSavedRecipes();
  const { data: recipe, isLoading, isError, refetch } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => fetchRecipeDetail(recipeId),
  });

  const onLog = async () => {
    if (!recipe) return;
    setIsLogging(true);
    try {
      await logMeal({ mealType: recipe.mealType, recipeId: recipe.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mealLogs", "today"] }),
        queryClient.invalidateQueries({ queryKey: ["recentFoods"] }),
      ]);
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

  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.instructions ?? [];
  const column = { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center", paddingHorizontal: layout.screenPadding } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ ...column, paddingBottom: spacing.lg, gap: spacing.md }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={10}
            style={{ width: 36, height: 36, justifyContent: "center", marginTop: spacing.xs }}
          >
            <Icon name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => saved.toggle(recipe.id)}
            accessibilityRole="button"
            accessibilityLabel={saved.isSaved(recipe.id) ? "Remove from saved recipes" : "Save recipe"}
            hitSlop={10}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", marginTop: spacing.xs }}
          >
            <Icon name="heart" size={22} color={saved.isSaved(recipe.id) ? colors.pink : colors.textPrimary} />
          </Pressable>
        </View>

        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            style={{ width: "100%", height: 190, borderRadius: radius.card, backgroundColor: colors.surfaceRaised }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              height: 190,
              borderRadius: radius.card,
              backgroundColor: "rgba(236,72,153,0.16)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="apple" size={40} color={colors.pink} />
          </View>
        )}

        <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>
          {recipe.name}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <MacroChip label="Calories" value={`${recipe.calories} kcal`} color={colors.textPrimary} />
          <MacroChip label="Protein" value={`${recipe.proteinG}g`} color={colors.success} />
          <MacroChip label="Carbs" value={`${recipe.carbsG}g`} color={theme.accent} />
          <MacroChip label="Fat" value={`${recipe.fatG}g`} color={colors.warning} />
        </View>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          Per serving · {recipe.mealType} · {recipe.prepTimeMinutes} min
        </Text>

        {ingredients.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>Ingredients ({ingredients.length})</Text>
            {ingredients.map((ing, i) => {
              const on = !!checked[i];
              return (
                <Pressable
                  key={`${ing.name}-${i}`}
                  onPress={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${ing.name}, ${ing.quantity}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      borderWidth: 1.5,
                      borderColor: theme.accent,
                      backgroundColor: on ? theme.accent : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {on ? <Icon name="check" size={12} color={theme.textOnAccent} strokeWidth={3} /> : null}
                  </View>
                  <Text style={{ flex: 1, color: colors.textPrimary, ...typography.body, fontSize: 13, opacity: on ? 0.6 : 1 }}>{ing.name}</Text>
                  <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13 }}>{ing.quantity}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {steps.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>Instructions</Text>
            {steps.map((step, i) => (
              <View key={i} style={{ gap: 2 }}>
                <Text style={{ color: theme.accent, fontSize: 11, fontFamily: fonts.bodySemi }}>Step {i + 1}</Text>
                <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {ingredients.length === 0 && steps.length === 0 ? (
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            Ingredients and method haven't been added for this recipe yet. You can still log it with the nutrition above.
          </Text>
        ) : null}
      </ScrollView>

      <View style={{ ...column, paddingBottom: spacing.sm, paddingTop: spacing.sm }}>
        <Pressable
          onPress={onLog}
          disabled={isLogging}
          accessibilityRole="button"
          accessibilityLabel="Log This Meal"
          style={{
            height: 52,
            borderRadius: radius.md,
            backgroundColor: theme.accent,
            alignItems: "center",
            justifyContent: "center",
            opacity: isLogging ? 0.6 : 1,
          }}
        >
          <Text style={{ color: theme.textOnAccent, ...typography.h3 }}>{isLogging ? "Logging…" : "Log This Meal"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MacroChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingVertical: 6,
        paddingHorizontal: spacing.sm + 2,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 9, fontFamily: fonts.bodyMedium }}>{label}</Text>
      <Text style={{ color, fontSize: 14, fontFamily: fonts.displayBold }}>{value}</Text>
    </View>
  );
}
