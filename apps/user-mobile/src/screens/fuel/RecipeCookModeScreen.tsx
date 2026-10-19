import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { RecipeVideo } from "../../components/RecipeVideo";
import { ScreenContainer } from "../../components/ScreenContainer";
import { fetchRecipeDetail } from "../../api/programs";
import { fetchTodayMealLogs, logMeal } from "../../api/nutrition";
import { useSavedRecipes } from "../../api/savedRecipes";
import { extractErrorMessage } from "../../lib/apiError";
import { formatMmSs } from "../../lib/format";
import { DAILY_TARGETS } from "../../lib/nutritionTargets";
import { ingredientsInStep, stepTimerSeconds } from "../../lib/recipeSteps";
import { clipLengthLabel, hasVideo, stepClip } from "../../lib/recipeVideo";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "RecipeCookMode">;

/**
 * Cooking mode (Figma Fuel 16 step guide + Fuel 17 finish): one recipe step
 * per screen with Previous / Next step, a timer when the step names a time,
 * and the ingredients the step mentions. The last step leads to a "Ready to
 * eat" finish with the recipe's macros, how much of today's protein target it
 * covers, Log this meal and Save recipe. The Figma "How was it?" rating has
 * nowhere to be stored, so it isn't shown.
 *
 * Recipe video (Oct 2026): when the recipe has a video with a marker for this
 * step, "Watch this step" plays just that part, muted and looping (hands are
 * busy). Once open it stays open from step to step, jumping to each step's
 * part; a step without a marker shows no video.
 */
export function RecipeCookModeScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const queryClient = useQueryClient();
  const { colors: theme } = useTheme();
  const saved = useSavedRecipes();
  const { data: recipe, isLoading, isError, refetch } = useQuery({ queryKey: ["recipe", recipeId], queryFn: () => fetchRecipeDetail(recipeId) });
  const { data: mealLogs } = useQuery({ queryKey: ["mealLogs", "today"], queryFn: fetchTodayMealLogs });
  const [index, setIndex] = useState(0);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const steps = recipe?.instructions ?? [];
  const finished = steps.length > 0 && index >= steps.length;
  const step = steps[index] ?? "";
  const timerSeconds = useMemo(() => stepTimerSeconds(step), [step]);
  const usedHere = useMemo(() => ingredientsInStep(step, recipe?.ingredients ?? []), [step, recipe?.ingredients]);
  const clip = useMemo(() => (hasVideo(recipe) ? stepClip(recipe.video, index) : null), [recipe, index]);

  // A new step starts with its own (stopped) timer.
  useEffect(() => {
    setTimerLeft(null);
    setTimerRunning(false);
  }, [index]);
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerLeft((t) => (t == null ? t : Math.max(0, t - 1))), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);
  useEffect(() => {
    if (timerLeft === 0) setTimerRunning(false);
  }, [timerLeft]);

  if (isError) {
    return (
      <ScreenContainer title="Cooking mode">
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }
  if (isLoading || !recipe) {
    return (
      <ScreenContainer title="Cooking mode">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const column = { width: "100%", maxWidth: layout.maxContentWidth, alignSelf: "center", paddingHorizontal: layout.screenPadding } as const;
  const proteinLeft = Math.max(0, Math.round(DAILY_TARGETS.proteinG - (mealLogs ?? []).reduce((s, m) => s + m.proteinG, 0)));

  const onLog = async () => {
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

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm }}>
      <Pressable
        onPress={() => (finished ? setIndex(steps.length - 1) : navigation.goBack())}
        accessibilityRole="button"
        accessibilityLabel={finished ? "Back to the last step" : "Close cooking mode"}
        hitSlop={10}
        style={{ width: 32, height: 32, justifyContent: "center" }}
      >
        <Icon name="chevron-left" size={24} color={colors.textPrimary} />
      </Pressable>
      <View style={{ flex: 1, flexDirection: "row", gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {steps.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? colors.success : colors.surfaceHigh }} />
        ))}
      </View>
      <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 13 }}>
        {Math.min(index + 1, steps.length)} / {steps.length}
      </Text>
    </View>
  );

  if (steps.length === 0) {
    return (
      <ScreenContainer title={recipe.name}>
        <Text style={{ color: colors.textSecondary, ...typography.body }}>This recipe has no method yet, so there's nothing to cook step by step.</Text>
        <Button label="Back to recipe" onPress={() => navigation.goBack()} />
      </ScreenContainer>
    );
  }

  if (finished) {
    const covers = Math.min(Math.round(recipe.proteinG), proteinLeft);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
        <View style={column}>{header}</View>
        <ScrollView contentContainerStyle={{ ...column, gap: spacing.md, paddingTop: spacing.lg }}>
          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" size={30} color={colors.successText} strokeWidth={3} />
            </View>
            <Text style={{ color: colors.successText, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 }}>READY TO EAT</Text>
            <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h1, fontSize: 24, textAlign: "center" }}>
              {recipe.name}
            </Text>
            <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>
              {recipe.calories} kcal · {recipe.proteinG} g protein · {recipe.carbsG} g carbs · {recipe.fatG} g fat
            </Text>
          </View>
          {mealLogs ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.6 }}>PROTEIN TODAY</Text>
              <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 15 }}>
                {proteinLeft > 0
                  ? `Logging this covers ${covers} g of the ${proteinLeft} g left of today's ${DAILY_TARGETS.proteinG} g target.`
                  : `You've already reached today's ${DAILY_TARGETS.proteinG} g protein target.`}
              </Text>
              {proteinLeft > 0 ? (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.accent, width: `${Math.min(100, (covers / proteinLeft) * 100)}%` }} />
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <View style={{ ...column, gap: spacing.sm, paddingVertical: spacing.sm }}>
          <Button label={isLogging ? "Logging…" : "Log this meal"} onPress={onLog} loading={isLogging} />
          <Button
            label={saved.isSaved(recipe.id) ? "Saved to your recipes" : "Save recipe"}
            variant="secondary"
            onPress={() => {
              if (!saved.isSaved(recipe.id)) saved.toggle(recipe.id);
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <View style={column}>{header}</View>
      <ScrollView contentContainerStyle={{ ...column, gap: spacing.md, paddingTop: spacing.md }}>
        <Text style={{ color: colors.successText, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 }}>
          STEP {index + 1} OF {steps.length}
        </Text>
        <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h1, fontSize: 21, lineHeight: 29 }}>
          {step}
        </Text>

        {timerSeconds ? (
          <Pressable
            onPress={() => {
              if (timerLeft == null || timerLeft === 0) setTimerLeft(timerSeconds);
              setTimerRunning((r) => !(r && timerLeft != null && timerLeft > 0));
            }}
            accessibilityRole="button"
            accessibilityLabel={
              timerLeft == null
                ? `Start ${formatMmSs(timerSeconds)} timer`
                : timerLeft === 0
                  ? "Timer done. Restart timer"
                  : timerRunning
                    ? `Pause timer, ${formatMmSs(timerLeft)} left`
                    : `Resume timer, ${formatMmSs(timerLeft)} left`
            }
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderRadius: radius.pill,
              backgroundColor: timerLeft === 0 ? colors.warningSoft : colors.successSoft,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Icon name="clock" size={16} color={timerLeft === 0 ? colors.warningText : colors.successText} />
            <Text style={{ color: timerLeft === 0 ? colors.warningText : colors.successText, fontFamily: fonts.bodySemi, fontSize: 14 }}>
              {timerLeft == null
                ? `Start ${formatMmSs(timerSeconds)} timer`
                : timerLeft === 0
                  ? "Time's up · restart"
                  : `${formatMmSs(timerLeft)} ${timerRunning ? "· pause" : "· resume"}`}
            </Text>
          </Pressable>
        ) : null}

        {clip && hasVideo(recipe) ? (
          <View style={{ gap: spacing.sm }}>
            <Pressable
              onPress={() => setShowVideo((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showVideo ? "Hide the step video" : `Watch this step, ${clipLengthLabel(clip.endSec - clip.startSec)}`}
              style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Icon name={showVideo ? "x" : "play"} size={16} color={theme.accentText} />
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>
                {showVideo ? "Hide video" : `Watch this step · ${clipLengthLabel(clip.endSec - clip.startSec)}`}
              </Text>
            </Pressable>
            {showVideo ? <RecipeVideo video={recipe.video} poster={recipe.imageUrl} clip={clip} loop autoPlay label={`step ${index + 1} video`} /> : null}
          </View>
        ) : null}

        {usedHere.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.6 }}>USED IN THIS STEP</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {usedHere.map((ing, i) => (
                <View key={`${ing.name}-${i}`} style={{ borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                    {ing.name} <Text style={{ color: colors.textSecondary, fontFamily: fonts.body }}>{ing.quantity}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={{ ...column, flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm }}>
        <Button label="Previous" variant="secondary" disabled={index === 0} onPress={() => setIndex(index - 1)} style={{ flex: 1 }} />
        <Button label={index === steps.length - 1 ? "Finish" : "Next step"} onPress={() => setIndex(index + 1)} style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}
