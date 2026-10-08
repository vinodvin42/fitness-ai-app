import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealPlan, MealPlanItem, MealType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { BottomSheet } from "../../components/BottomSheet";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { ReasoningSheet } from "../../components/ReasoningSheet";
import { fetchCurrentMealPlan, generateMealPlan } from "../../api/mealPlans";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "MealPlan">;

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};
const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
const fmtShort = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Meal Plan (Figma Fuel 06): "Plan: Oct 24 – Oct 30" with a "Re-Gen" badge, a
 * week strip, a "Generate Meal Plan" banner and the selected day's meals
 * (slot tag, recipe, kcal). Backed by the Meal-Plan Generation Engine
 * (apps/api/src/modules/mealPlans); generate is synchronous from here, and
 * replacing an existing plan asks for confirmation first.
 *
 * Plan items only carry a day NUMBER (1..durationDays), so the calendar dates
 * are derived: Day 1 is the day the plan was generated, Day N is N-1 days
 * later. The strip therefore starts on that weekday, not always Monday.
 */
export function MealPlanScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const { colors: theme } = useTheme();
  const [showWhy, setShowWhy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const { data: mealPlan, isLoading, isError, refetch } = useQuery({
    queryKey: ["mealPlan", "current"],
    queryFn: fetchCurrentMealPlan,
  });

  const start = useMemo(() => {
    if (!mealPlan) return null;
    const c = new Date(mealPlan.createdAt);
    return new Date(c.getFullYear(), c.getMonth(), c.getDate());
  }, [mealPlan]);

  const itemsByDay = useMemo(() => {
    const grouped = new Map<number, MealPlanItem[]>();
    for (const item of mealPlan?.items ?? []) {
      const forDay = grouped.get(item.dayNumber) ?? [];
      forDay.push(item);
      grouped.set(item.dayNumber, forDay);
    }
    for (const [k, v] of grouped) grouped.set(k, [...v].sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType)));
    return grouped;
  }, [mealPlan]);

  // Default to today when it falls inside the plan, else Day 1.
  const todayIndex = useMemo(() => {
    if (!mealPlan || !start) return 1;
    const now = new Date();
    for (let n = 1; n <= mealPlan.durationDays; n++) if (sameDay(addDays(start, n - 1), now)) return n;
    return 1;
  }, [mealPlan, start]);
  const selectedDay = picked ?? todayIndex;

  const onGenerate = async () => {
    setConfirmRegen(false);
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const generated = await generateMealPlan();
      queryClient.setQueryData<MealPlan | null>(["mealPlan", "current"], generated.status === "generated" ? generated : mealPlan ?? null);
      if (generated.status === "generated") setPicked(null);
      else setGenerationError(generated.failureReason ?? "Couldn't build your meal plan.");
    } catch (err) {
      setGenerationError(extractErrorMessage(err, "Couldn't build your meal plan — check your connection and try again."));
    } finally {
      setIsGenerating(false);
    }
  };
  const requestGenerate = () => (mealPlan ? setConfirmRegen(true) : onGenerate());

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

  const planRange =
    mealPlan && start ? `Plan: ${fmtShort(start)} – ${fmtShort(addDays(start, mealPlan.durationDays - 1))}` : undefined;
  const dayItems = itemsByDay.get(selectedDay) ?? [];
  const dayKcal = dayItems.reduce((s, i) => s + i.calories, 0);
  const selectedDate = start ? addDays(start, selectedDay - 1) : null;
  const dayName = selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: "long" }) : `Day ${selectedDay}`;

  const regenBadge = mealPlan ? (
    <Pressable
      onPress={requestGenerate}
      accessibilityRole="button"
      accessibilityLabel="Regenerate meal plan"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: theme.accent,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Icon name="sparkles" size={13} color={theme.textOnAccent} />
      <Text style={{ color: theme.textOnAccent, ...typography.label, fontSize: 11 }}>Re-Gen</Text>
    </Pressable>
  ) : undefined;

  return (
    <ScreenContainer title="Meal Plan" subtitle={planRange ? `Fynrox Meal ${planRange}` : undefined} right={regenBadge}>
      {mealPlan?.rationale ? (
        <ReasoningSheet
          visible={showWhy}
          onClose={() => setShowWhy(false)}
          title="Why this meal plan?"
          rationale={mealPlan.rationale}
          rows={[{ label: "Based on", value: "Your diet type, allergens and goals" }]}
          generatedAt={mealPlan.createdAt}
          caveat="Portions, food labels and incomplete logs can change nutrition estimates. General wellness advice only."
        />
      ) : null}

      <BottomSheet visible={confirmRegen} onClose={() => setConfirmRegen(false)} title="Regenerate meal plan?">
        <Text style={{ color: colors.textSecondary, ...typography.body, marginBottom: spacing.md }}>
          This replaces your current plan with a new one built from the recipe catalog. Meals you've already logged aren't affected.
        </Text>
        <View style={{ gap: spacing.sm }}>
          <Button label="Regenerate" onPress={onGenerate} />
          <Button label="Keep current plan" variant="secondary" onPress={() => setConfirmRegen(false)} />
        </View>
      </BottomSheet>

      {mealPlan && start ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {Array.from({ length: mealPlan.durationDays }, (_, i) => i + 1).map((n) => {
            const d = addDays(start, n - 1);
            const on = n === selectedDay;
            return (
              <Pressable
                key={n}
                onPress={() => setPicked(n)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: spacing.sm,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: on ? theme.accent : colors.border,
                  backgroundColor: on ? theme.accentSoft : colors.surface,
                }}
              >
                <Text style={{ color: on ? theme.accent : colors.textMuted, fontSize: 9, fontFamily: fonts.bodyMedium }}>
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </Text>
                <Text style={{ color: on ? theme.accent : colors.textPrimary, fontSize: 14, fontFamily: fonts.displayBold }}>
                  {d.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {generationError ? (
        <Card>
          <Text style={{ color: colors.danger, ...typography.body }}>{generationError}</Text>
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
          <Pressable
            onPress={requestGenerate}
            accessibilityRole="button"
            accessibilityLabel="Generate Meal Plan"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.infoSurface,
              borderWidth: 1,
              borderColor: theme.accent,
            }}
          >
            <Icon name="sparkles" size={20} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Generate Meal Plan</Text>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>Built from your diet, allergens and goals</Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textPrimary} />
          </Pressable>

          <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16 }}>
            {selectedDate ? `${dayName}'s Plan` : `Day ${selectedDay}`} ({dayKcal.toLocaleString()} cal)
          </Text>
          {dayItems.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>No meals planned for this day.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {dayItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => navigation.navigate("RecipeDetail", { recipeId: item.recipeId })}
                  accessibilityRole="button"
                  accessibilityLabel={`${MEAL_LABELS[item.mealType]}: ${item.recipeName}, ${item.calories} calories`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    paddingVertical: spacing.md,
                    paddingRight: spacing.md,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                  }}
                >
                  <View style={{ width: 3, alignSelf: "stretch", backgroundColor: theme.accent }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.accent, fontSize: 10, fontFamily: fonts.bodySemi }}>{MEAL_LABELS[item.mealType]}</Text>
                    <Text style={{ color: colors.textPrimary, ...typography.h3 }} numberOfLines={2}>
                      {item.recipeName}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, ...typography.label }}>{item.calories} cal</Text>
                </Pressable>
              ))}
            </View>
          )}

          {mealPlan.rationale ? (
            <Pressable
              onPress={() => setShowWhy(true)}
              accessibilityRole="button"
              accessibilityLabel="Why this meal plan?"
              style={{ alignSelf: "flex-start", paddingVertical: spacing.xs }}
            >
              <Text style={{ color: colors.aiAccent, ...typography.label }}>✦ Why this plan?</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
