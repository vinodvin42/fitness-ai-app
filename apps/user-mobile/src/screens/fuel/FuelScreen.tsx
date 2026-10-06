import React, { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MealLog, MealType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Icon, IconName } from "../../components/Icon";
import { ProgressRing } from "../../components/ProgressRing";
import { ErrorState } from "../../components/ErrorState";
import { fetchTodayMealLogs, fetchTodayWaterLogs, logWater } from "../../api/nutrition";
import { fetchNotifications } from "../../api/notifications";
import { extractErrorMessage } from "../../lib/apiError";
import { formatTimeOfDay } from "../../lib/format";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { DAILY_TARGETS } from "../../lib/nutritionTargets";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "FuelDashboard">;

const WATER_GOAL_GLASSES = 8; // placeholder goal (no per-user hydration goal is modeled)
const ML_PER_GLASS = 250;

// Figma Fuel 01 order: the timeline reads in the order people usually eat.
const TIMELINE: Array<{ type: MealType; label: string }> = [
  { type: "breakfast", label: "Breakfast" },
  { type: "lunch", label: "Lunch" },
  { type: "snack", label: "Snacks" },
  { type: "dinner", label: "Dinner" },
];

function defaultMealType(): MealType {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack";
}

/**
 * Nutrition dashboard (Figma Fuel 01): header with date + bell, "Daily total"
 * ring with kcal left and macro bars, Meal Timeline, Water Intake card
 * (goal in litres = glasses x 250 ml) and a floating "Snap a meal" pill.
 * Totals come from today's MealLogs; calorie/macro targets are the app-wide
 * defaults in lib/nutritionTargets (no per-user target is modeled yet).
 */
export function FuelScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const { colors: theme } = useTheme();
  const { data: mealLogs, isLoading, isError, refetch } = useQuery({
    queryKey: ["mealLogs", "today"],
    queryFn: fetchTodayMealLogs,
  });
  const { data: waterLogs, isError: isWaterError, refetch: refetchWater } = useQuery({
    queryKey: ["waterLogs", "today"],
    queryFn: fetchTodayWaterLogs,
  });
  const { data: inbox } = useQuery({
    queryKey: ["notifications", "badge"],
    queryFn: () => fetchNotifications({ filter: "unread", limit: 1 }),
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

  const dateLabel = `Today, ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  const openNotifications = () => {
    // Notifications live in the Today stack; jump across tabs.
    (navigation.getParent() as { navigate: (name: string, params?: object) => void } | undefined)?.navigate("Today", {
      screen: "Notifications",
    });
  };

  const bell = (
    <Pressable
      onPress={openNotifications}
      accessibilityRole="button"
      accessibilityLabel={inbox && inbox.unreadCount > 0 ? `Notifications, ${inbox.unreadCount} unread` : "Notifications"}
      hitSlop={8}
      style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="bell" size={22} color={colors.textPrimary} />
      {inbox && inbox.unreadCount > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 9,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.danger,
            borderWidth: 1.5,
            borderColor: colors.background,
          }}
        />
      ) : null}
    </Pressable>
  );

  if (isError) {
    return (
      <ScreenContainer title="Nutrition" subtitle={dateLabel} right={bell}>
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }

  const onAddGlass = async () => {
    if (isLoggingWater) return;
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

  const kcalLeft = Math.max(0, DAILY_TARGETS.calories - totals.calories);
  const goalLitres = ((WATER_GOAL_GLASSES * ML_PER_GLASS) / 1000).toFixed(1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenContainer title="Nutrition" subtitle={dateLabel} right={bell}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: spacing.xs }}>
          <Text style={{ color: colors.textSecondary, ...typography.label }}>Daily total</Text>
          <Text style={{ color: theme.accent, ...typography.label }}>
            {totals.calories.toLocaleString()} / {DAILY_TARGETS.calories.toLocaleString()} kcal
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
          <ProgressRing
            progress={totals.calories / DAILY_TARGETS.calories}
            size={112}
            strokeWidth={9}
            color={theme.accent}
            trackColor={colors.surfaceHigh}
          >
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: colors.textPrimary, fontSize: 24, fontFamily: fonts.displayBold }}>{kcalLeft}</Text>
              <Text style={{ color: colors.textMuted, ...typography.caption, textAlign: "center" }}>{"kcal\nleft"}</Text>
            </View>
          </ProgressRing>
          <View style={{ flex: 1, gap: spacing.md }}>
            <MacroBar label="Protein" value={totals.proteinG} target={DAILY_TARGETS.proteinG} color={theme.accent} />
            <MacroBar label="Carbs" value={totals.carbsG} target={DAILY_TARGETS.carbsG} color={colors.success} />
            <MacroBar label="Fat" value={totals.fatG} target={DAILY_TARGETS.fatG} color={colors.aiAccent} />
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <QuickLink icon="search" label="Log food" onPress={() => navigation.navigate("LogMeal", { mealType: defaultMealType() })} />
          <QuickLink icon="apple" label="Recipes" onPress={() => navigation.navigate("Recipes")} />
          <QuickLink icon="sparkles" label="Meal plan" onPress={() => navigation.navigate("MealPlan")} />
          <QuickLink icon="calendar" label="History" onPress={() => navigation.navigate("NutritionCalendar")} />
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.sm }}>Meal Timeline</Text>
        <View style={{ gap: spacing.sm }}>
          {TIMELINE.map(({ type, label }) => {
            const logs = byMealType[type];
            const kcal = logs.reduce((sum, l) => sum + l.calories, 0);
            const latest = logs.length > 0 ? logs[logs.length - 1] : null;
            const open = () => !isLoading && navigation.navigate("LogMeal", { mealType: type });
            if (!latest) {
              return (
                <Pressable
                  key={type}
                  onPress={open}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, not logged yet. Tap to add`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: colors.borderStrong,
                  }}
                >
                  <IconTile icon="plus" tint={colors.textSecondary} bg={colors.surfaceHigh} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{label}</Text>
                    <Text style={{ color: colors.textMuted, ...typography.meta }}>Not logged yet</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, ...typography.label }}>Tap to add</Text>
                </Pressable>
              );
            }
            return (
              <Pressable
                key={type}
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${kcal} kilocalories. Tap to add more`}
              >
                <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md }}>
                  <IconTile icon="utensils" tint={theme.accent} bg={theme.accentSoft} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{label}</Text>
                    <Text style={{ color: colors.textMuted, ...typography.meta }}>
                      {logs.length > 1 ? `${logs.length} items · ` : ""}Logged at {formatTimeOfDay(new Date(latest.loggedAt))}
                    </Text>
                  </View>
                  <Text style={{ color: theme.accent, ...typography.label }}>{kcal} kcal</Text>
                </Card>
              </Pressable>
            );
          })}
        </View>

        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.md }}>
          {isWaterError ? (
            <View style={{ flex: 1 }}>
              <ErrorState message="Couldn't load today's water intake." onRetry={() => refetchWater()} />
            </View>
          ) : (
            <>
              <IconTile icon="droplet" tint={colors.cyan} bg="rgba(34,211,238,0.12)" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Water Intake</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  Goal: {WATER_GOAL_GLASSES} glasses ({goalLitres}L)
                </Text>
              </View>
              <Text
                accessibilityLabel={`${totalGlasses} of ${WATER_GOAL_GLASSES} glasses of water logged today`}
                style={{ color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayBold }}
              >
                {totalGlasses}/{WATER_GOAL_GLASSES}
              </Text>
              <Pressable
                onPress={onAddGlass}
                disabled={isLoggingWater}
                accessibilityRole="button"
                accessibilityLabel="Add one glass of water"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: colors.surfaceHigh,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: isLoggingWater ? 0.5 : 1,
                }}
              >
                <Icon name="plus" size={16} color={colors.textPrimary} />
              </Pressable>
            </>
          )}
        </Card>

        <View style={{ height: 64 }} />
      </ScreenContainer>

      <Pressable
        onPress={() => navigation.navigate("SnapMeal", { mealType: defaultMealType() })}
        accessibilityRole="button"
        accessibilityLabel="Snap a meal"
        style={{
          position: "absolute",
          alignSelf: "center",
          bottom: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          height: 44,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: theme.accent,
          shadowColor: theme.accent,
          shadowOpacity: 0.45,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Icon name="plus" size={16} color={theme.textOnAccent} />
        <Text style={{ color: theme.textOnAccent, ...typography.label, fontSize: 14 }}>Snap a meal</Text>
      </Pressable>
    </View>
  );
}

function IconTile({ icon, tint, bg }: { icon: IconName; tint: string; bg: string }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={18} color={tint} />
    </View>
  );
}

function QuickLink({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        alignItems: "center",
        gap: 6,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, ...typography.meta }}>{label}</Text>
    </Pressable>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          {value}/{target}g
        </Text>
      </View>
      <View style={{ height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}
