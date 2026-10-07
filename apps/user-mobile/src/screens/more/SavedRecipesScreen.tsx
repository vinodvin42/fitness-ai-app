import React from "react";
import { Pressable, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp } from "@react-navigation/native";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { SkeletonCard } from "../../components/Skeleton";
import { useSavedRecipes } from "../../api/savedRecipes";
import { colors, spacing } from "../../theme/tokens";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";

type Props = NativeStackScreenProps<MoreStackParamList, "SavedRecipes">;

/** Profile > Saved Recipes: the recipes the user bookmarked with the heart on Recipes / Recipe Detail. */
export function SavedRecipesScreen({ navigation }: Props) {
  const saved = useSavedRecipes();
  const tabs = () => navigation.getParent<NavigationProp<MainTabsParamList>>();
  const items = saved.data ?? [];

  return (
    <RecoverShell centered title="Saved Recipes" onBack={() => navigation.goBack()}>
      {saved.isLoading ? (
        <SkeletonCard lines={3} />
      ) : saved.isError ? (
        <ErrorState message="Couldn't load your saved recipes." onRetry={() => saved.refetch()} />
      ) : items.length === 0 ? (
        <View style={{ gap: spacing.md }}>
          <EmptyState title="No saved recipes yet" subtitle="Tap the heart on any recipe to keep it here." />
          <Button label="Browse recipes" onPress={() => tabs()?.navigate("Fuel", { screen: "Recipes" })} />
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((r) => (
            <ListRow
              key={r.id}
              icon="utensils"
              imageUrl={r.imageUrl}
              tint={colors.pink}
              tintSoft="rgba(236,72,153,0.16)"
              title={r.name}
              subtitle={`${r.calories} kcal · ${r.prepTimeMinutes} min`}
              onPress={() => tabs()?.navigate("Fuel", { screen: "RecipeDetail", params: { recipeId: r.id } })}
              right={
                <Pressable
                  onPress={() => saved.toggle(r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${r.name} from saved recipes`}
                  hitSlop={10}
                >
                  <Icon name="heart" size={20} color={colors.pink} />
                </Pressable>
              }
            />
          ))}
        </View>
      )}
    </RecoverShell>
  );
}
