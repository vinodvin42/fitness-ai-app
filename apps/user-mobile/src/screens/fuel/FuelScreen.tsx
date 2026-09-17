import React, { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealLog, MealType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { ProgressRing } from "../../components/ProgressRing";
import { ErrorState } from "../../components/ErrorState";
import { fetchTodayMealLogs, fetchTodayWaterLogs, logWater } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "FuelDashboard">;

// Placeholder daily targets — see gap §10 (no goal-setting field modeled yet).
const DAILY_TARGETS = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 65 };
const WATER_GOAL_GLASSES = 8; // placeholder — see gap §25

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/**
 * Nutrition Dashboard (fuel-01) — docs/mobile/03-screen-inventory.md §D. 31
 * Aug 2026 design polish: a real calorie ProgressRing, color-coded macro
 * bars, iconized meal-timeline rows and entry points. Data wiring
 * (MealLog/WaterLog totals, per-slot timeline, +1 Glass) is unchanged.
 */
export function FuelScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const { data: mealLogs, isLoading, isError, refetch } = useQuery({
    queryKey: ["mealLogs", "today"],
    queryFn: fetchTodayMealLogs,
  });
  const { data: waterLogs, isError: isWaterError, refetch: refetchWater } = useQuery({
    queryKey: ["waterLogs", "today"],
    queryFn: fetchTodayWaterLogs,
  });
  const [isLoggingWater, setIsLoggingWater] = useState(false);

  const totals = useMemo(() => {
    const logs = mealLogs ?? [];
    return logs.reduce(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        proteinG: acc.proteinG + log.proteinG,
        carbsG: acc.carbsG + log.carbsG,
        fatG: acc.fatG + log.fatG,
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
  }, [mealLogs]);

  const totalGlasses = useMemo(() => (waterLogs ?? []).reduce((sum, w) => sum + w.glasses, 0), [waterLogs]);

  const byMealType = useMemo(() => {
    const grouped: Record<MealType, MealLog[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    for (const log of mealLogs ?? []) grouped[log.mealType].push(log);
    return grouped;
  }, [mealLogs]);

  if (isError) {
    return (
      <ScreenContainer title="Fuel">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  const onAddGlass = async () => {
    setIsLoggingWater(true);
    try {
      await logWater({ glasses: 1 });
      await queryClient.invalidateQueries({ queryKey: ["waterLogs", "today"] });
    } catch (err) {
      Alert.alert("Couldn't log water", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsLoggingWater(false);
    }
  };

  const remaining = Math.max(0, DAILY_TARGETS.calories - totals.calories);

  return (
    <ScreenContainer title="Fuel" subtitle="Today's nutrition">
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
          <ProgressRing progress={totals.calories / DAILY_TARGETS.calories} size={116} strokeWidth={12} color={colors.orange}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: colors.textPrimary, fontSize: 26, fontFamily: fonts.mono }}>{totals.calories}</Text>
              <Text style={{ color: colors.textMuted, ...typography.caption }}>of {DAILY_TARGETS.calories}</Text>
            </View>
          </ProgressRing>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Icon name="flame" size={18} color={colors.orange} />
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Calories</Text>
            </View>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>{remaining} kcal remaining</Text>
            <MacroBar label="Protein" value={totals.proteinG} target={DAILY_TARGETS.proteinG} color={colors.success} />
            <MacroBar label="Carbs" value={totals.carbsG} target={DAILY_TARGETS.carbsG} color={colors.warning} />
            <MacroBar label="Fat" value={totals.fatG} target={DAILY_TARGETS.fatG} color={colors.pink} />
          </View>
        </View>
      </Card>

      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.sm }}>Meals</Text>
      <View style={{ gap: spacing.sm }}>
        {MEAL_TYPES.map((mt) => {
          const logs = byMealType[mt];
          const kcal = logs.reduce((sum, l) => sum + l.calories, 0);
          return (
            <ListRow
              key={mt}
              icon="utensils"
              tint={colors.success}
              tintSoft={colors.successSoft}
              title={MEAL_LABELS[mt]}
              subtitle={logs.length > 0 ? logs.map((l) => l.name).join(", ") : "Tap to add"}
              onPress={() => !isLoading && navigation.navigate("LogMeal", { mealType: mt })}
              right={
                <Text style={{ color: logs.length > 0 ? colors.textPrimary : colors.textMuted, ...typography.label }}>
                  {logs.length > 0 ? `${kcal}` : "+"}
                </Text>
              }
            />
          );
        })}
      </View>

      <Card style={{ marginTop: spacing.sm }}>
        {isWaterError ? (
          <ErrorState message="Couldn't load today's water intake." onRetry={() => refetchWater()} />
        ) : (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Icon name="droplet" size={18} color={colors.cyan} />
                <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Hydration</Text>
              </View>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                {totalGlasses} / {WATER_GOAL_GLASSES}
              </Text>
            </View>
            <View
              accessible
              accessibilityLabel={`${totalGlasses} of ${WATER_GOAL_GLASSES} glasses of water logged today`}
              style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md }}
            >
              {Array.from({ length: Math.max(WATER_GOAL_GLASSES, totalGlasses) }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: colors.cyan,
                    backgroundColor: i < totalGlasses ? colors.cyan : "transparent",
                  }}
                />
              ))}
            </View>
            <Button
              label="+1 Glass"
              variant="secondary"
              onPress={onAddGlass}
              loading={isLoggingWater}
              style={{ marginTop: spacing.md, height: 42 }}
            />
          </>
        )}
      </Card>

      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <ListRow
          icon="apple"
          title="Recipes"
          subtitle="Browse & log meals"
          tint={colors.pink}
          tintSoft={"rgba(236,72,153,0.16)"}
          onPress={() => navigation.navigate("Recipes")}
        />
        <ListRow
          icon="calendar"
          title="Nutrition Calendar"
          subtitle="Compliance & history"
          tint={colors.warning}
          tintSoft={colors.warningSoft}
          onPress={() => navigation.navigate("NutritionCalendar")}
        />
      </View>
    </ScreenContainer>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ color: colors.textSecondary, ...typography.caption }}>{label}</Text>
        <Text style={{ color: colors.textMuted, ...typography.caption }}>
          {value}/{target}g
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}
