import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { FoodEstimateItem, MealType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { PortionSheet } from "../../components/PortionSheet";
import { confirmFoodEstimate, createSavedMeal } from "../../api/nutrition";
import { extractErrorMessage } from "../../lib/apiError";
import { asUnit, formatAmount, portionText, quickAmounts, rescale, totals } from "../../lib/indianPortions";
import { BRAND_NAME } from "../../lib/brand";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography, themed } from "../../theme/tokens";
import type { FuelStackParamList } from "../../navigation/FuelStack";
import { exitTaskToHome } from "../../navigation/taskExits";
import { LearnMoreLink } from "../../components/LearnMoreSheet";

type Props = NativeStackScreenProps<FuelStackParamList, "ConfirmFoodEstimate">;

const MEAL_LABEL: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Confirm Food Estimate (U4, 15 Sep 2026) — the real BR-DAT-003 gate:
 * "estimated data is not actual until confirmed/edited where required."
 * Nothing is written to MealLog until the member confirms here; whether the
 * log is "confirmed" or "edited" is decided server-side by comparing what's
 * submitted with the estimate.
 *
 * 24 Oct 2026 (Figma fuel/12, owner: "build indian portions"): when the
 * estimate is itemised, each food is reviewed on its own — its portion in
 * Indian units (tap to change it in the portion sheet, Figma fuel/11), quick
 * amounts, a "Not sure" card when the AI couldn't tell two foods apart, and a
 * total marked as an estimate. Older single estimates keep the editable form.
 */
export function ConfirmFoodEstimateScreen({ route, navigation }: Props) {
  const { estimate } = route.params;
  const queryClient = useQueryClient();
  const { colors: theme } = useTheme();
  const [name, setName] = useState(estimate.name ?? "");
  const [calories, setCalories] = useState(String(estimate.calories ?? ""));
  const [protein, setProtein] = useState(String(estimate.proteinG ?? 0));
  const [carbs, setCarbs] = useState(String(estimate.carbsG ?? 0));
  const [fat, setFat] = useState(String(estimate.fatG ?? 0));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveForLater, setSaveForLater] = useState(false);
  const [items, setItems] = useState<FoodEstimateItem[]>(estimate.items ?? []);
  const [choice, setChoice] = useState<Array<"main" | "alt" | "removed">>((estimate.items ?? []).map(() => "main"));
  const [editing, setEditing] = useState<number | null>(null);

  const itemised = items.length > 0;
  // A photo-only estimate is stored with the description "Meal photo" (nutrition.service.ts).
  const fromPhoto = estimate.description === "Meal photo";
  const sum = totals(items, choice);
  const chosenNames = items
    .map((it, i) => (choice[i] === "removed" ? null : choice[i] === "alt" && it.alt ? it.alt.name : it.name))
    .filter((n): n is string => !!n);
  const canSubmit = itemised ? chosenNames.length > 0 : name.trim().length > 0 && calories.trim().length > 0;

  const onLogIt = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const final = itemised
        ? {
            name: chosenNames.join(", ").slice(0, 120),
            calories: Math.min(sum.calories, 10000),
            proteinG: Math.min(sum.proteinG, 1000),
            carbsG: Math.min(sum.carbsG, 1000),
            fatG: Math.min(sum.fatG, 1000),
          }
        : {
            name: name.trim(),
            calories: parseInt(calories, 10) || 0,
            proteinG: parseInt(protein, 10) || 0,
            carbsG: parseInt(carbs, 10) || 0,
            fatG: parseInt(fat, 10) || 0,
          };
      await confirmFoodEstimate(estimate.id, final);
      if (saveForLater) {
        // The reviewed numbers (not the raw AI guess) become the saved meal. Best effort: the meal is already logged.
        await createSavedMeal(final).catch(() => undefined);
        queryClient.invalidateQueries({ queryKey: ["savedMeals"] });
      }
      queryClient.invalidateQueries({ queryKey: ["recentFoods"] });
      await queryClient.invalidateQueries({ queryKey: ["mealLogs", "today"] });
      exitTaskToHome(navigation, "FuelDashboard");
    } catch (err) {
      Alert.alert("Couldn't log this meal", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const setItem = (i: number, next: FoodEstimateItem) => setItems((prev) => prev.map((it, j) => (j === i ? next : it)));
  const setItemChoice = (i: number, c: "main" | "alt" | "removed") => setChoice((prev) => prev.map((x, j) => (j === i ? c : x)));

  const saveBox = (
    <Pressable
      onPress={() => setSaveForLater((v) => !v)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: saveForLater }}
      accessibilityLabel="Save to My Saved Meals"
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: saveForLater ? colors.accent : colors.borderStrong,
          backgroundColor: saveForLater ? colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {saveForLater ? <Icon name="check" size={13} color={colors.textOnAccent} strokeWidth={3} /> : null}
      </View>
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13 }}>Save to My Saved Meals</Text>
    </Pressable>
  );

  if (itemised) {
    const created = new Date(estimate.createdAt);
    const when = `${WEEKDAYS[created.getDay()]}, ${created.getDate()} ${MONTHS[created.getMonth()]}, ${created.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    const pill = (label: string, selected: boolean, onPress: () => void, key: string) => (
      <Pressable
        key={key}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: selected ? theme.accent : colors.border,
          backgroundColor: selected ? theme.accent : colors.surfaceRaised,
        }}
      >
        <Text style={{ color: selected ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
      </Pressable>
    );
    const row = (label: string, value: string, onPress?: () => void) => (
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : "text"} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
        <Text style={{ color: onPress ? theme.accentText : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{value}</Text>
      </Pressable>
    );

    return (
      <ScreenContainer edges={["top", "bottom"]} title={fromPhoto ? "Review your photo" : "Review your meal"}>
        <Text style={{ color: theme.accentText, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.6 }}>
          ✦ {BRAND_NAME.toUpperCase()} AI ESTIMATE · {MEAL_LABEL[estimate.mealType].toUpperCase()} · {when.toUpperCase()}
        </Text>
        <Text style={{ color: colors.textPrimary, ...typography.h1 }}>We think this is…</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
          Check each item and portion before saving. Nothing is added to your diary until you confirm.
        </Text>

        {items.map((it, i) => {
          const unit = asUnit(it.unit);
          const c = choice[i];
          const portion = unit === "g" || unit === "ml" ? portionText(it.amount, unit) : `${portionText(it.amount, unit)} · ~${it.grams} g`;
          if (it.alt) {
            return (
              <View key={i} style={{ borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.warning, backgroundColor: colors.surface, padding: spacing.md, gap: 8 }}>
                <Text style={{ color: colors.warningText, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.6 }}>NOT SURE</Text>
                <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{it.alt.question}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Pick one so the estimate is closer.</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {pill(it.name, c === "main", () => setItemChoice(i, "main"), "main")}
                  {pill(it.alt.name, c === "alt", () => setItemChoice(i, "alt"), "alt")}
                  {pill("Remove", c === "removed", () => setItemChoice(i, "removed"), "remove")}
                </View>
                {c !== "removed" ? row("Portion", portion, () => setEditing(i)) : null}
              </View>
            );
          }
          return (
            <View key={i} style={{ borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: 8, opacity: c === "removed" ? 0.5 : 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3, flex: 1 }}>● {it.name}</Text>
                <Pressable onPress={() => setItemChoice(i, c === "removed" ? "main" : "removed")} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{c === "removed" ? "Add back" : "Remove"}</Text>
                </Pressable>
              </View>
              {c !== "removed" ? (
                <>
                  {row("Portion", portion, () => setEditing(i))}
                  {row("Estimate", `${it.calories} kcal · ${it.proteinG} g protein`)}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {quickAmounts(unit).map((q) =>
                      pill(
                        unit === "katori" || unit === "cup" || unit === "bowl" ? `${formatAmount(q, unit)} ${unit}` : formatAmount(q, unit),
                        Math.abs(q - it.amount) < 1e-6,
                        () => setItem(i, rescale(it, q, unit)),
                        String(q),
                      ),
                    )}
                  </View>
                </>
              ) : null}
            </View>
          );
        })}

        <View style={{ borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: 6 }}>
          {row("Total (estimate)", `~${sum.calories} kcal`)}
          {row("Protein", `~${sum.proteinG} g`)}
          {row("Carbs / Fat", `~${sum.carbsG} g / ~${sum.fatG} g`)}
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Estimates vary with recipe and oil. Tap a portion to change it, or switch to grams if you weighed it.</Text>
          <LearnMoreLink topic="food_estimates" />
        </View>

        {saveBox}
        <Button label={`Add to ${MEAL_LABEL[estimate.mealType]}`} onPress={onLogIt} loading={isSubmitting} disabled={!canSubmit} style={{ marginTop: spacing.md }} />
        <Button label={fromPhoto ? "Retake photo" : "Back"} variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: spacing.sm }} />

        <PortionSheet
          item={editing != null ? items[editing] : null}
          onClose={() => setEditing(null)}
          onApply={(next) => {
            if (editing != null) setItem(editing, next);
            setEditing(null);
          }}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom"]} title="Confirm Estimate" subtitle={`“${estimate.description}”`}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm }}>
          <Text style={{ fontSize: 18 }}>✨</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>AI estimate — review before logging</Text>
        </View>
        <Text style={{ color: colors.textMuted, ...typography.caption, marginBottom: spacing.md }}>
          These numbers are a guess, not a fact yet. Edit anything that looks off, then log it.
        </Text>

        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>What you ate</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.textMuted} />

        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs }}>Calories</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={calories}
          onChangeText={setCalories}
          placeholderTextColor={colors.textMuted}
        />

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Protein (g)</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={protein} onChangeText={setProtein} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Carbs (g)</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={carbs} onChangeText={setCarbs} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Fat (g)</Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={fat} onChangeText={setFat} />
          </View>
        </View>
      </Card>

      {saveBox}

      <Button label="Log it" onPress={onLogIt} loading={isSubmitting} disabled={!canSubmit} style={{ marginTop: spacing.md }} />
      <Button
        label="Cancel"
        variant="secondary"
        onPress={() => navigation.goBack()}
        style={{ marginTop: spacing.sm }}
      />
    </ScreenContainer>
  );
}

const styles = themed(() => ({
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
  },
} as const));
