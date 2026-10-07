import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Recipe } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchRecipes } from "../../api/programs";
import { useSavedRecipes } from "../../api/savedRecipes";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "Recipes">;

/** Filter chips from the Figma. Each is a real predicate over the Recipe row: a tag, or prep time. */
const FILTERS: Array<{ key: string; label: string; test: (r: Recipe) => boolean }> = [
  { key: "high-protein", label: "High Protein", test: (r) => r.tags.includes("high-protein") },
  { key: "low-carb", label: "Low Carb", test: (r) => r.tags.includes("low-carb") },
  { key: "vegan", label: "Vegan", test: (r) => r.tags.includes("vegan") },
  { key: "under-30", label: "Under 30min", test: (r) => r.prepTimeMinutes < 30 },
];

/**
 * Recipes (Figma Fuel 04): "Healthy cooking, simplified", filter chips and a
 * 2-column grid of photo cards (name + kcal / serving). The Figma's star
 * ratings are NOT shown: recipes have no rating data (no review entity), and a
 * made-up number would be fabricated. Tap a chip to filter, tap again to clear.
 */
export function RecipesScreen({ navigation }: Props) {
  const recipesQuery = useQuery({ queryKey: ["recipes"], queryFn: fetchRecipes });
  const [active, setActive] = useState<string | null>(null);
  const saved = useSavedRecipes();

  const data = useMemo(() => {
    const all = recipesQuery.data ?? [];
    const f = FILTERS.find((x) => x.key === active);
    return f ? all.filter(f.test) : all;
  }, [recipesQuery.data, active]);

  return (
    <ScreenContainer title="Recipes" subtitle="Healthy cooking, simplified" scroll={false}>
      {recipesQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : recipesQuery.isError ? (
        <ErrorState onRetry={() => recipesQuery.refetch()} />
      ) : (
        <FlatList
          data={data}
          numColumns={2}
          keyExtractor={(item: Recipe) => item.id}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ gap: spacing.sm }}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
          ListHeaderComponent={
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}
              style={{ flexGrow: 0 }}
            >
              {FILTERS.map((f) => (
                <Chip key={f.key} label={f.label} selected={active === f.key} onPress={() => setActive(active === f.key ? null : f.key)} />
              ))}
            </ScrollView>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("RecipeDetail", { recipeId: item.id })}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.calories} kilocalories per serving`}
              style={{
                flex: 1,
                maxWidth: "50%",
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
              }}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={{ width: "100%", height: 104, backgroundColor: colors.surfaceRaised }} resizeMode="cover" />
              ) : (
                <View style={{ height: 104, backgroundColor: "rgba(236,72,153,0.16)", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="apple" size={30} color={colors.pink} />
                </View>
              )}
              <View style={{ padding: spacing.sm + 2, gap: 2 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 13 }} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }} numberOfLines={1}>
                  {item.calories} kcal / serving
                </Text>
              </View>
              <Pressable
                onPress={() => saved.toggle(item.id)}
                accessibilityRole="button"
                accessibilityLabel={saved.isSaved(item.id) ? `Remove ${item.name} from saved recipes` : `Save ${item.name}`}
                hitSlop={8}
                style={{
                  position: "absolute",
                  top: spacing.sm,
                  right: spacing.sm,
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: "rgba(9,9,11,0.6)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="heart" size={16} color={saved.isSaved(item.id) ? colors.pink : colors.textPrimary} />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState title="No recipes match" subtitle={active ? "Tap the selected filter again to clear it." : "No recipes yet."} />
          }
        />
      )}
    </ScreenContainer>
  );
}
