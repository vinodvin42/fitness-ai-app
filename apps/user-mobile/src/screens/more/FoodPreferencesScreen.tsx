import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { OptionRow } from "../../components/WizardParts";
import { editOnboardingProfile, fetchOnboardingProfile } from "../../api/users";
import { extractErrorMessage } from "../../lib/apiError";
import { ALLERGENS, DIET_TYPES, toggleAllergen } from "../../lib/healthFoodOptions";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "FoodPreferences">;

/**
 * Food preferences after setup (24 Oct 2026, the setup checklist's "Food
 * preferences" and Profile): the onboarding 07 diet type and allergies,
 * editable any time (PATCH /users/me/onboarding). Meal plan generation reads
 * the same fields (mealPlans.service.ts).
 */
export function FoodPreferencesScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: profile, isLoading, isError, refetch } = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile });
  const [diet, setDiet] = useState<string | null>(null);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile || loaded) return;
    setDiet(profile.dietType ?? null);
    setAllergens(profile.allergens ?? []);
    setLoaded(true);
  }, [profile, loaded]);

  // A diet saved before these options existed (older accounts) is kept and shown.
  const options = diet && !DIET_TYPES.some((d) => d.value === diet) ? [...DIET_TYPES, { value: diet, subtitle: "" }] : DIET_TYPES;

  const onSave = async () => {
    setSaving(true);
    try {
      await editOnboardingProfile({ dietType: diet, allergens });
      await queryClient.invalidateQueries({ queryKey: ["onboardingProfile"] });
      toast.show("Food preferences saved.", "success");
      navigation.goBack();
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't save. Check your connection and try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecoverShell centered title="Food preferences" onBack={() => navigation.goBack()}>
      {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {isError ? <ErrorState message="Couldn't load your preferences." onRetry={() => refetch()} /> : null}
      {loaded ? (
        <>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14, lineHeight: 20 }}>
            Used when we build your meal plans.
          </Text>
          <GroupHeader>How do you eat?</GroupHeader>
          <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
            {options.map((d) => (
              <OptionRow key={d.value} dense title={d.value} subtitle={d.subtitle || undefined} selected={diet === d.value} onPress={() => setDiet(d.value)} />
            ))}
          </View>
          <GroupHeader>Allergies</GroupHeader>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {ALLERGENS.map((a) => (
              <Chip key={a} label={a} variant="outlined" selected={allergens.includes(a)} onPress={() => setAllergens((cur) => toggleAllergen(cur, a))} />
            ))}
          </View>
          <Button label="Save" onPress={onSave} loading={saving} disabled={saving || !diet} />
        </>
      ) : null}
    </RecoverShell>
  );
}
