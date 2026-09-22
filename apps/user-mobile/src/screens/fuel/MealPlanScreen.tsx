import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealPlan, MealPlanItem, MealType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ListRow } from "../../components/ListRow";
import { Pill } from "../../components/Pill";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { fetchCurrentMealPlan, generateMealPlan } from "../../api/mealPlans";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "MealPlan">;

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};
const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/**
 * Meal Plan (docs/mobile/03-screen-inventory.md §D "Meal Plan", 22 Sep
 * 2026) — the Fuel sibling of onboarding's PlanGeneratingScreen, wired to
 * apps/api's new Meal-Plan Generation Engine
 * (apps/api/src/modules/mealPlans). Same real client conventions as
 * api/plans.ts: POST /nutrition/meal-plans/generate is synchronous from
 * this screen's point of view — it awaits the real LLM call server-side
 * and resolves with a FINAL status ("generated" or "failed"), never
 * "generating"; that phase only exists here as the in-flight loading
 * state.
 *
 * Unlike the onboarding Plan flow (a one-shot screen reached once, at
 * signup), this is a real Fuel-tab destination reachable any time, so it
 * fetches the existing active MealPlan on mount (GET .../current) rather
 * than always generating fresh — "Generate Meal Plan" is the empty-state
 * action, "Regenerate" the same action once one already exists.
 */
export function MealPlanScreen(_props: Props) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const { data: mealPlan, isLoading, isError, refetch } = useQuery({
    queryKey: ["mealPlan", "current"],
    queryFn: fetchCurrentMealPlan,
  });

  const itemsByDay = useMemo(() => {
    const grouped = new Map<number, MealPlanItem[]>();
    for (const item of mealPlan?.items ?? []) {
      const forDay = grouped.get(item.dayNumber) ?? [];
      forDay.push(item);
      grouped.set(item.dayNumber, forDay);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dayNumber, items]) => ({
        dayNumber,
        items: [...items].sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType)),
      }));
  }, [mealPlan]);

  const onGenerate = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const generated = await generateMealPlan();
      queryClient.setQueryData<MealPlan | null>(["mealPlan", "current"], generated.status === "generated" ? generated : mealPlan ?? null);
      if (generated.status !== "generated") {
        setGenerationError(generated.failureReason ?? "Couldn't build your meal plan.");
      }
    } catch (err) {
      setGenerationError(
        extractErrorMessage(err, "Couldn't build your meal plan — check your connection and try again."),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer title="Meal Plan" scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </ScreenContainer>
    );
  }

  if (isError) {
    return (
      <ScreenContainer title="Meal Plan">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  if (isGenerating) {
    return (
      <ScreenContainer title="Meal Plan" scroll={false}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={{ color: colors.textSecondary, ...typography.body, marginTop: spacing.md, textAlign: "center" }}>
            Picking real recipes that fit your diet and goals…
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Meal Plan" subtitle={mealPlan ? `${mealPlan.durationDays}-day plan` : undefined}>
      {generationError ? (
        <Card style={{ marginBottom: spacing.sm }}>
          <Text style={{ color: colors.danger, ...typography.body }}>{generationError}</Text>
        </Card>
      ) : null}

      {mealPlan?.rationale ? (
        <Card style={{ marginBottom: spacing.sm }}>
          <Text style={{ color: colors.textSecondary, ...typography.body }}>{mealPlan.rationale}</Text>
        </Card>
      ) : null}

      {!mealPlan ? (
        <EmptyState
          title="No meal plan yet"
          subtitle="Generate a real, AI-curated meal plan built from your diet type, allergens, and goals — using real recipes from the catalog."
          actionLabel="Generate Meal Plan"
          onAction={onGenerate}
        />
      ) : (
        <>
          <Button
            label="Regenerate"
            variant="secondary"
            onPress={() =>
              Alert.alert("Regenerate meal plan?", "This replaces your current plan with a new one.", [
                { text: "Cancel", style: "cancel" },
                { text: "Regenerate", onPress: onGenerate },
              ])
            }
            style={{ marginBottom: spacing.md }}
          />
          {itemsByDay.map(({ dayNumber, items }) => (
            <View key={dayNumber} style={{ marginBottom: spacing.md }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Day {dayNumber}</Text>
              <View style={{ gap: spacing.sm }}>
                {items.map((item) => (
                  <ListRow
                    key={item.id}
                    icon="apple"
                    imageUrl={item.recipeImageUrl}
                    tint={colors.pink}
                    tintSoft="rgba(236,72,153,0.16)"
                    title={item.recipeName}
                    subtitle={MEAL_LABELS[item.mealType]}
                    onPress={() => _props.navigation.navigate("RecipeDetail", { recipeId: item.recipeId })}
                    right={<Pill label={`${item.calories} kcal`} tone="warning" />}
                  />
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </ScreenContainer>
  );
}
