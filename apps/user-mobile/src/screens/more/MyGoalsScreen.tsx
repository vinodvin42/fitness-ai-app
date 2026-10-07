import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { editOnboardingProfile, fetchOnboardingProfile } from "../../api/users";
import { extractErrorMessage } from "../../lib/apiError";
import { GOAL_OPTIONS } from "../../lib/goalOptions";
import { kgToLb, lbToKg, useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "MyGoals">;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * My Goals: the goals picked in onboarding plus the optional goal weight, both
 * editable here (PATCH /users/me/onboarding). Goals that are not one of the
 * standard chips (older accounts) are kept and shown as selected.
 */
export function MyGoalsScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const units = useMeasureUnits();
  const lb = units.weightUnit === "lb";
  const { data: profile, isLoading, isError, refetch } = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile });

  const [goals, setGoals] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || loaded) return;
    setGoals(profile.goals ?? []);
    setTarget(profile.targetWeightKg != null ? String(round1(lb ? kgToLb(profile.targetWeightKg) : profile.targetWeightKg)) : "");
    setLoaded(true);
  }, [profile, loaded, lb]);

  const options = [...GOAL_OPTIONS, ...goals.filter((g) => !GOAL_OPTIONS.includes(g))];
  const toggle = (g: string) => setGoals((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const onSave = async () => {
    setError(null);
    let targetWeightKg: number | null = null;
    if (target.trim()) {
      const v = parseFloat(target.replace(",", "."));
      const kg = lb ? lbToKg(v) : v;
      if (!Number.isFinite(kg) || kg < 20 || kg > 400) return setError(`Enter a goal weight between ${lb ? "45 and 880 lb" : "20 and 400 kg"}.`);
      targetWeightKg = Math.round(kg * 10) / 10;
    }
    setSaving(true);
    try {
      await editOnboardingProfile({ goals, targetWeightKg });
      await queryClient.invalidateQueries({ queryKey: ["onboardingProfile"] });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save goals", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecoverShell centered title="My Goals" onBack={() => navigation.goBack()}>
      {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {isError ? <ErrorState message="Couldn't load your goals." onRetry={() => refetch()} /> : null}
      {loaded ? (
        <>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>Select all that apply. These tune your dashboards and plans.</Text>
          <GroupHeader>Goals</GroupHeader>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {options.map((g) => (
              <Chip key={g} label={g} selected={goals.includes(g)} showCheck onPress={() => toggle(g)} />
            ))}
          </View>

          <GroupHeader>Goal weight</GroupHeader>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>Target weight ({lb ? "lb" : "kg"}), optional</Text>
            <TextInput
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
              placeholder="No target set"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Goal weight"
              style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14, minHeight: 32 }}
            />
          </View>
          {error ? <Text style={{ color: colors.danger, ...typography.meta }}>{error}</Text> : null}
          <Button label="Save Goals" onPress={onSave} loading={saving} disabled={goals.length === 0} />
        </>
      ) : null}
    </RecoverShell>
  );
}
