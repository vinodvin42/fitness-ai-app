import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { LogMealInput, MealType, RecentFood, SavedMeal } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon, IconName } from "../../components/Icon";
import { SearchBar } from "../../components/SearchBar";
import { useToast } from "../../components/Toast";
import {
  createFoodEstimate,
  createSavedMeal,
  deleteSavedMeal,
  fetchRecentFoods,
  fetchSavedMeals,
  fetchTodayMealLogs,
  logMeal,
} from "../../api/nutrition";
import { fetchRecipes } from "../../api/programs";
import { extractErrorMessage } from "../../lib/apiError";
import { formatTimeOfDay } from "../../lib/format";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { FuelStackParamList } from "../../navigation/FuelStack";

type Props = NativeStackScreenProps<FuelStackParamList, "LogMeal">;

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const DRAFT_KEY = "logMeal.draft.v1";
// A retry that finds an identical meal logged this recently after the failed attempt treats the save as having gone through.
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

interface MealDraft {
  mealType: MealType;
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  /** ISO time of the first (failed) save attempt — shown as "Today, 1:30 PM" and used for the duplicate check. */
  attemptedAt?: string;
}

/** Quick-log calories: 4 kcal/g protein and carbs, 9 kcal/g fat. */
export function caloriesFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
}

function toInt(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function defaultMealType(): MealType {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack";
}

/**
 * Log Food (Figma Fuel 02) and, when a save fails, "Meal wasn't saved"
 * (Fuel 08). Sections: search (your recent foods, saved meals and recipes —
 * there is no public food catalog) with a barcode shortcut, Take Photo,
 * Recent Foods (distinct foods from the user's own meal logs), My Saved Meals
 * (the user's own SavedMeal rows), and Manual Macro Entry whose "Quick Log"
 * posts a meal with calories derived 4/4/9. Exact name/calories entry (and
 * the barcode prefill and AI describe-a-meal estimate) stay available under
 * "Add name or exact calories" / the search results. A failed save keeps the
 * draft on-device and offers Retry (which first checks today's log so a save
 * that actually succeeded is never duplicated) and Edit draft.
 */
export function LogMealScreen({ route, navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { colors: theme } = useTheme();
  const [mealType, setMealType] = useState<MealType>(route.params?.mealType ?? defaultMealType());
  const [query, setQuery] = useState("");
  const [isEstimating, setIsEstimating] = useState(false);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [saveForLater, setSaveForLater] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannedLabel, setScannedLabel] = useState<string | null>(null);
  // Fuel 08 — set when POST /meal-logs fails; the form below IS the draft, so nothing is cleared.
  const [saveFailed, setSaveFailed] = useState(false);
  const [attemptedAt, setAttemptedAt] = useState<string | null>(null);

  const recentQuery = useQuery({ queryKey: ["recentFoods"], queryFn: () => fetchRecentFoods(6) });
  const savedQuery = useQuery({ queryKey: ["savedMeals"], queryFn: fetchSavedMeals });
  const recipesQuery = useQuery({ queryKey: ["recipes"], queryFn: fetchRecipes, enabled: query.trim().length > 0 });

  // Restore a draft that survived a failed save (kept on-device in AsyncStorage).
  useEffect(() => {
    if (route.params?.barcodePrefill) return;
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        const d = JSON.parse(raw) as MealDraft;
        setMealType(d.mealType);
        setName(d.name);
        setCalories(d.calories);
        setProtein(d.protein);
        setCarbs(d.carbs);
        setFat(d.fat);
        setAttemptedAt(d.attemptedAt ?? null);
        setShowDetails(true);
        setSaveFailed(true);
      })
      .catch(() => undefined);
  }, []);

  const barcodePrefill = route.params?.barcodePrefill;
  useEffect(() => {
    if (!barcodePrefill) return;
    setName(barcodePrefill.brand ? `${barcodePrefill.name} (${barcodePrefill.brand})` : barcodePrefill.name);
    setCalories(String(barcodePrefill.calories));
    setProtein(String(barcodePrefill.proteinG));
    setCarbs(String(barcodePrefill.carbsG));
    setFat(String(barcodePrefill.fatG));
    setShowDetails(true);
    setScannedLabel(
      `From barcode scan — ${barcodePrefill.basis === "serving" ? `per serving${barcodePrefill.servingSize ? ` (${barcodePrefill.servingSize})` : ""}` : "per 100g"}. Review before logging.`,
    );
    // Consume the param once so re-focusing this screen doesn't re-apply it
    // over edits the user has since made.
    navigation.setParams({ barcodePrefill: undefined });
  }, [barcodePrefill]);

  const refreshAfterLog = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mealLogs", "today"] }),
      queryClient.invalidateQueries({ queryKey: ["recentFoods"] }),
      queryClient.invalidateQueries({ queryKey: ["nutrition"] }),
    ]);
  };

  // ---- one-tap logging of a known food (recent food, saved meal, recipe) ----
  const quickLog = useMutation({
    mutationFn: (input: LogMealInput) => logMeal(input),
    onSuccess: async (_log, input) => {
      await refreshAfterLog();
      toast.show(`Logged ${input.name ?? "meal"} to ${MEAL_LABELS[input.mealType]}`, "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't log that meal. Try again."), "error"),
  });

  const saveMeal = useMutation({
    mutationFn: createSavedMeal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedMeals"] });
      toast.show("Saved to My Saved Meals", "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't save that meal."), "error"),
  });
  const unsaveMeal = useMutation({
    mutationFn: deleteSavedMeal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedMeals"] });
      toast.show("Removed from My Saved Meals", "info");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't remove that saved meal."), "error"),
  });

  const saved = savedQuery.data ?? [];
  const savedFor = (f: { name: string; calories: number }) =>
    saved.find((s) => s.name.toLowerCase() === f.name.toLowerCase() && s.calories === f.calories);

  const logRecent = (f: RecentFood) =>
    quickLog.mutate({ mealType, name: f.name, calories: f.calories, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG });
  const logSaved = (s: SavedMeal) =>
    quickLog.mutate({ mealType, name: s.name, calories: s.calories, proteinG: s.proteinG, carbsG: s.carbsG, fatG: s.fatG });
  const toggleSaveRecent = (f: RecentFood) => {
    const existing = savedFor(f);
    if (existing) unsaveMeal.mutate(existing.id);
    else saveMeal.mutate({ name: f.name, calories: f.calories, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG });
  };

  // ---- manual macro entry / exact entry ----
  const macroCalories = caloriesFromMacros(toInt(protein), toInt(carbs), toInt(fat));
  const typedCalories = calories.trim().length > 0 ? toInt(calories) : null;
  const finalCalories = typedCalories ?? macroCalories;
  const finalName = name.trim() || "Quick log";
  const canSubmit = finalCalories > 0 && (showDetails ? name.trim().length > 0 || typedCalories === null : true);

  const buildInput = (): LogMealInput => ({
    mealType,
    name: finalName,
    calories: finalCalories,
    proteinG: protein ? toInt(protein) : undefined,
    carbsG: carbs ? toInt(carbs) : undefined,
    fatG: fat ? toInt(fat) : undefined,
  });

  const clearForm = () => {
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setScannedLabel(null);
    setShowDetails(false);
    setSaveForLater(false);
  };

  const onSubmit = async (isRetry = false) => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const input = buildInput();
    const startedAt = isRetry && attemptedAt ? attemptedAt : new Date().toISOString();
    try {
      let alreadySaved = false;
      if (isRetry) {
        // A save that failed on a dropped response may have gone through: check before posting again.
        try {
          const today = await fetchTodayMealLogs();
          const since = new Date(startedAt).getTime() - 60 * 1000;
          alreadySaved = today.some(
            (l) =>
              l.name === input.name &&
              l.calories === input.calories &&
              l.mealType === input.mealType &&
              new Date(l.loggedAt).getTime() >= since &&
              new Date(l.loggedAt).getTime() <= since + DUPLICATE_WINDOW_MS,
          );
        } catch {
          alreadySaved = false;
        }
      }
      if (!alreadySaved) await logMeal(input);
      if (saveForLater && showDetails) {
        createSavedMeal({
          name: input.name!,
          calories: input.calories!,
          proteinG: input.proteinG,
          carbsG: input.carbsG,
          fatG: input.fatG,
        })
          .then(() => queryClient.invalidateQueries({ queryKey: ["savedMeals"] }))
          .catch(() => undefined);
      }
      await refreshAfterLog();
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
      setSaveFailed(false);
      setAttemptedAt(null);
      clearForm();
      navigation.navigate("FuelDashboard");
    } catch {
      // Keep every field as typed and persist it on-device so leaving the screen doesn't lose it.
      setSaveFailed(true);
      setAttemptedAt(startedAt);
      const draft: MealDraft = { mealType, name, calories, protein, carbs, fat, attemptedAt: startedAt };
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEstimate = async (description: string) => {
    if (!description.trim()) return;
    setIsEstimating(true);
    try {
      const estimate = await createFoodEstimate({ mealType, description: description.trim() });
      if (estimate.status === "insufficient_context") {
        Alert.alert(
          "Couldn't estimate that",
          estimate.failureReason ?? "Try describing it differently, or use manual entry below.",
        );
        return;
      }
      navigation.navigate("ConfirmFoodEstimate", { estimate });
    } catch (err) {
      Alert.alert("Couldn't estimate this meal", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsEstimating(false);
    }
  };

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    return {
      saved: saved.filter((s) => s.name.toLowerCase().includes(q)),
      recent: (recentQuery.data ?? []).filter((f) => f.name.toLowerCase().includes(q)),
      recipes: (recipesQuery.data ?? []).filter((r) => r.name.toLowerCase().includes(q)).slice(0, 8),
    };
  }, [q, saved, recentQuery.data, recipesQuery.data]);

  const backChip = (
    <Pressable
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="chevron-left" size={22} color={colors.textPrimary} />
    </Pressable>
  );

  // ---------------------------------------------------------------------
  // Fuel 08 — "Meal wasn't saved"
  // ---------------------------------------------------------------------
  if (saveFailed) {
    const when = attemptedAt ? new Date(attemptedAt) : new Date();
    const p = toInt(protein);
    const c = toInt(carbs);
    const f = toInt(fat);
    return (
      <ScreenContainer
        title="Log Meal"
        subtitle={`${MEAL_LABELS[mealType]} · Today, ${formatTimeOfDay(when)}`}
        right={backChip}
      >
        <View
          accessibilityRole="alert"
          style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.md, gap: 10 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name="circle-alert" size={20} color={colors.danger} />
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Meal wasn't saved</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            We couldn't confirm the save. This meal hasn't been added to your diary or daily totals.
          </Text>
          <Text style={{ color: colors.textPrimary, ...typography.label }}>Your draft is safe on this device.</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>Check your connection, then try again.</Text>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16, flex: 1 }}>{finalName}</Text>
            <View style={{ backgroundColor: colors.warningSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: colors.warning, ...typography.caption }}>Unsaved</Text>
            </View>
          </View>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>{MEAL_LABELS[mealType]}</Text>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xs }} />
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{finalCalories} kcal · Draft</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>
            Protein {p} g · Carbs {c} g · Fat {f} g
          </Text>
        </View>

        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          Previously saved meals are unchanged. Retrying will check the save status before adding this meal.
        </Text>

        <Pressable
          onPress={() => onSubmit(true)}
          disabled={isSubmitting || !canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Retry saving meal"
          style={{
            height: 52,
            borderRadius: radius.md,
            backgroundColor: theme.accent,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.sm,
            opacity: isSubmitting || !canSubmit ? 0.6 : 1,
          }}
        >
          <Icon name="rotate-cw" size={18} color={theme.textOnAccent} />
          <Text style={{ color: theme.textOnAccent, ...typography.h3 }}>{isSubmitting ? "Retrying…" : "Retry saving meal"}</Text>
        </Pressable>
        <Button label="Edit draft" variant="secondary" onPress={() => setSaveFailed(false)} />
        <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
          You can leave this screen. Your draft stays on this device.
        </Text>
      </ScreenContainer>
    );
  }

  // ---------------------------------------------------------------------
  // Fuel 02 — Log Food
  // ---------------------------------------------------------------------
  const macroInput = (label: string, value: string, set: (v: string) => void) => (
    <View style={{ flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: "center" }}>
      <Text style={{ color: colors.textMuted, ...typography.caption }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center" }}>
        <TextInput
          value={value}
          onChangeText={(t) => set(t.replace(/[^0-9]/g, "").slice(0, 4))}
          placeholder="0"
          placeholderTextColor={colors.textPrimary}
          keyboardType="number-pad"
          accessibilityLabel={`${label} grams`}
          style={{ color: colors.textPrimary, fontSize: 20, fontFamily: fonts.displayBold, width: 46, textAlign: "right", padding: 0 }}
        />
        <Text style={{ color: colors.textPrimary, fontSize: 20, fontFamily: fonts.displayBold }}>g</Text>
      </View>
    </View>
  );

  const sectionTitle = (t: string) => (
    <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 16, marginTop: spacing.xs }}>{t}</Text>
  );

  const foodRow = (key: string, title: string, sub: string, kcal: number, onAdd: () => void, onPress?: () => void, heart?: { filled: boolean; onPress: () => void }) => (
    <Pressable
      key={key}
      onPress={onPress ?? onAdd}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${kcal} kilocalories`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={{ color: colors.textSecondary, ...typography.label }}>{kcal} kcal</Text>
      {heart ? (
        <Pressable
          onPress={heart.onPress}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={heart.filled ? "Remove from My Saved Meals" : "Save to My Saved Meals"}
          style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="heart" size={16} color={heart.filled ? colors.warning : colors.textMuted} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={onAdd}
        disabled={quickLog.isPending}
        accessibilityRole="button"
        accessibilityLabel={`Log ${title}`}
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: theme.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="plus" size={16} color={theme.accent} />
      </Pressable>
    </Pressable>
  );

  const macroLine = (f: { proteinG: number; carbsG: number; fatG: number }) => `${f.proteinG}g P · ${f.carbsG}g C · ${f.fatG}g F`;

  const recent = recentQuery.data ?? [];

  return (
    <ScreenContainer title="Log Food" subtitle="Select meal to log" right={backChip}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {MEAL_TYPES.map((mt) => (
          <Chip key={mt} label={MEAL_LABELS[mt]} selected={mealType === mt} onPress={() => setMealType(mt)} />
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search food or scan barcode" />
        </View>
        <Pressable
          onPress={() => navigation.navigate("BarcodeScanner", { mealType })}
          accessibilityRole="button"
          accessibilityLabel="Scan barcode"
          style={{
            width: 50,
            height: 50,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surfaceRaised,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="scan-barcode" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      {matches ? (
        <View style={{ gap: spacing.sm }}>
          {sectionTitle("Results")}
          {matches.saved.map((s) => foodRow(`s-${s.id}`, s.name, `Saved · ${macroLine(s)}`, s.calories, () => logSaved(s)))}
          {matches.recent.map((f) =>
            foodRow(`r-${f.name}`, f.name, `Recent · ${macroLine(f)}`, f.calories, () => logRecent(f), undefined, {
              filled: !!savedFor(f),
              onPress: () => toggleSaveRecent(f),
            }),
          )}
          {matches.recipes.map((r) =>
            foodRow(
              `c-${r.id}`,
              r.name,
              `Recipe · ${macroLine(r)}`,
              r.calories,
              () => quickLog.mutate({ mealType, recipeId: r.id, name: r.name }),
              () => navigation.navigate("RecipeDetail", { recipeId: r.id }),
            ),
          )}
          {matches.saved.length + matches.recent.length + matches.recipes.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {recipesQuery.isLoading ? "Searching…" : "Nothing in your foods, saved meals or recipes matches that."}
            </Text>
          ) : null}
          <TakeRow
            icon="sparkles"
            title={isEstimating ? "Estimating…" : `Estimate “${query.trim()}” with AI`}
            subtitle="You review and can edit the numbers before it's logged"
            onPress={() => onEstimate(query)}
          />
          <TakeRow
            icon="pencil"
            title="Enter it manually"
            subtitle="Type the name and macros yourself"
            onPress={() => {
              setName(query.trim());
              setShowDetails(true);
              setQuery("");
            }}
          />
        </View>
      ) : (
        <>
          <TakeRow
            icon="camera"
            title="Take Photo"
            subtitle="Snap a meal to log it instantly"
            onPress={() => navigation.navigate("SnapMeal", { mealType })}
          />

          {sectionTitle("Recent Foods")}
          {recent.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {recentQuery.isLoading ? "Loading…" : "Foods you log will show up here for one-tap re-logging."}
            </Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {recent.map((f) =>
                foodRow(`r-${f.name}`, f.name, macroLine(f), f.calories, () => logRecent(f), undefined, {
                  filled: !!savedFor(f),
                  onPress: () => toggleSaveRecent(f),
                }),
              )}
            </View>
          )}

          {sectionTitle("My Saved Meals")}
          {saved.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              Tap the heart on a recent food, or tick “Save to My Saved Meals” when you log one, to keep it here.
            </Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {saved.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => logSaved(s)}
                  accessibilityRole="button"
                  accessibilityLabel={`Log saved meal ${s.name}, ${s.calories} kilocalories`}
                  style={{
                    width: "48.5%",
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: 6,
                  }}
                >
                  <Pressable
                    onPress={() => unsaveMeal.mutate(s.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${s.name} from My Saved Meals`}
                    style={{ alignSelf: "flex-start" }}
                  >
                    <Icon name="heart" size={18} color={colors.warning} />
                  </Pressable>
                  <Text style={{ color: colors.textPrimary, ...typography.h3 }} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta }} numberOfLines={1}>
                    {s.calories} kcal · {s.proteinG}g P
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}

      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Manual Macro Entry</Text>
          <Pressable
            onPress={() => onSubmit(false)}
            disabled={!canSubmit || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Quick Log"
            hitSlop={8}
          >
            <Text style={{ color: theme.accent, ...typography.label, opacity: canSubmit && !isSubmitting ? 1 : 0.5 }}>
              {isSubmitting ? "Logging…" : "Quick Log"}
            </Text>
          </Pressable>
        </View>
        {scannedLabel ? <Text style={{ color: theme.accent, ...typography.caption }}>{scannedLabel}</Text> : null}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {macroInput("Carbs", carbs, setCarbs)}
          {macroInput("Protein", protein, setProtein)}
          {macroInput("Fat", fat, setFat)}
        </View>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          {typedCalories === null
            ? `Calories are worked out from your macros (4 / 4 / 9 kcal per g): ${macroCalories} kcal.`
            : `Using your exact ${typedCalories} kcal.`}
        </Text>

        <Pressable
          onPress={() => setShowDetails((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          accessibilityLabel="Add name or exact calories"
        >
          <Text style={{ color: theme.accent, ...typography.label }}>
            {showDetails ? "Hide name and exact calories" : "Add name or exact calories"}
          </Text>
        </Pressable>
        {showDetails ? (
          <View style={{ gap: spacing.sm }}>
            <TextInput
              style={styles.input}
              placeholder="What did you eat?"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              maxLength={120}
            />
            <TextInput
              style={styles.input}
              placeholder="Calories (optional — otherwise derived from macros)"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              value={calories}
              onChangeText={(t) => setCalories(t.replace(/[^0-9]/g, "").slice(0, 5))}
            />
            <Pressable
              onPress={() => setSaveForLater((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: saveForLater }}
              accessibilityLabel="Save to My Saved Meals"
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: saveForLater ? theme.accent : colors.borderStrong,
                  backgroundColor: saveForLater ? theme.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {saveForLater ? <Icon name="check" size={13} color={theme.textOnAccent} strokeWidth={3} /> : null}
              </View>
              <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13 }}>Save to My Saved Meals</Text>
            </Pressable>
          </View>
        ) : null}
        {showDetails ? (
          <Button label="Log Meal" onPress={() => onSubmit(false)} loading={isSubmitting} disabled={!canSubmit} />
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function TakeRow({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.warningSoft, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name={icon} size={18} color={colors.warning} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{title}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{subtitle}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = {
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
} as const;
