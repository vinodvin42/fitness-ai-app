import React from "react";
import { ActivityIndicator, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Recipe } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ListRow } from "../../components/ListRow";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchRecipes } from "../../api/programs";
import { colors, spacing } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "Recipes">;

/**
 * Recipes (fuel-04) — docs/mobile/03-screen-inventory.md §D. 31 Aug 2026
 * design polish: iconized rows with a calorie pill. Data/navigation
 * unchanged (flat list → Recipe Detail; no rating data modeled).
 *
 * 4 Sep 2026: rows show the recipe's own photo (`Recipe.imageUrl`) where
 * there is one, falling back to the apple icon tile otherwise — see
 * ListRow's `imageUrl` prop.
 */
export function RecipesScreen({ navigation }: Props) {
  const recipesQuery = useQuery({ queryKey: ["recipes"], queryFn: fetchRecipes });

  return (
    <ScreenContainer title="Recipes" scroll={false}>
      {recipesQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : recipesQuery.isError ? (
        <ErrorState onRetry={() => recipesQuery.refetch()} />
      ) : (
        <FlatList
          data={recipesQuery.data ?? []}
          keyExtractor={(item: Recipe) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <ListRow
              icon="apple"
              imageUrl={item.imageUrl}
              tint={colors.pink}
              tintSoft="rgba(236,72,153,0.16)"
              title={item.name}
              subtitle={`${item.mealType} · ${item.prepTimeMinutes} min`}
              onPress={() => navigation.navigate("RecipeDetail", { recipeId: item.id })}
              right={<Pill label={`${item.calories} kcal`} tone="warning" />}
            />
          )}
          ListEmptyComponent={<EmptyState title="No recipes yet" />}
        />
      )}
    </ScreenContainer>
  );
}
