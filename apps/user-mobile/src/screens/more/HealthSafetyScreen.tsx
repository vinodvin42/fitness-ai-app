import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { CheckboxField, OptionRow } from "../../components/WizardParts";
import { fetchOnboardingProfile, updateHealthAnswers } from "../../api/users";
import { extractErrorMessage } from "../../lib/apiError";
import { BRAND_NAME } from "../../lib/brand";
import { EXCLUSIVE_CONDITIONS, INJURIES, MEDICAL_CONDITIONS, isHeartCondition, toggleCondition } from "../../lib/healthFoodOptions";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "HealthSafety">;

/**
 * Health & safety after setup (24 Oct 2026): Figma today/safer-plan-sheet
 * ("Make your plan safer · 1 min", for members who skipped health data at
 * setup) and Profile › Health & safety for anyone changing their answers.
 * Same choices and consent rule as onboarding 08 (lib/healthFoodOptions.ts):
 * without consent the answers are discarded, not stored. The API applies the
 * same safety review to newly reported conditions (PUT
 * /users/me/onboarding/health).
 */
export function HealthSafetyScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: profile, isLoading, isError, refetch } = useQuery({ queryKey: ["onboardingProfile"], queryFn: fetchOnboardingProfile });
  const [conditions, setConditions] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pauseNotice, setPauseNotice] = useState(false);

  useEffect(() => {
    if (!profile || loaded) return;
    setConditions(profile.medicalConditions ?? []);
    setInjuries(profile.injuries ?? []);
    // Answers on file were stored with consent.
    setConsent((profile.medicalConditions?.length ?? 0) + (profile.injuries?.length ?? 0) > 0);
    setLoaded(true);
  }, [profile, loaded]);

  const real = conditions.filter((c) => !EXCLUSIVE_CONDITIONS.includes(c));
  const hasAnswers = real.length > 0 || injuries.length > 0;
  const skipped = !!profile?.healthDataSkippedAt;

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await updateHealthAnswers({ medicalConditions: conditions, injuries, healthDataConsent: hasAnswers ? consent : false });
      await queryClient.invalidateQueries({ queryKey: ["onboardingProfile"] });
      if (res.safetyOutcome === "pause") {
        setPauseNotice(true);
        return;
      }
      toast.show("Saved.", "success");
      navigation.goBack();
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't save. Check your connection and try again."), "error");
    } finally {
      setSaving(false);
    }
  };

  if (pauseNotice) {
    return (
      <RecoverShell centered title="Health & safety" onBack={() => navigation.goBack()}>
        <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <Icon name="alert-triangle" size={18} color={colors.warning} />
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Please check with your doctor</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
            You told us about a heart condition. Please check with your doctor before starting a new exercise plan. Your answers are saved,
            and {BRAND_NAME} uses them only to keep your guidance safer.
          </Text>
        </View>
        <Button label="Done" onPress={() => navigation.goBack()} />
      </RecoverShell>
    );
  }

  return (
    <RecoverShell centered title="Health & safety" onBack={() => navigation.goBack()}>
      {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      {isError ? <ErrorState message="Couldn't load your answers." onRetry={() => refetch()} /> : null}
      {loaded ? (
        <>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14, lineHeight: 20 }}>
            {skipped
              ? "Make your plan safer in about a minute. You skipped these questions at setup."
              : "Your answers help keep your workouts safe. Change them any time."}
          </Text>

          <GroupHeader>Any health conditions?</GroupHeader>
          <View style={{ gap: spacing.sm }}>
            {MEDICAL_CONDITIONS.map((c) => (
              <OptionRow
                key={c}
                dense
                title={c}
                trailing="checkbox"
                accessibilityRole="checkbox"
                selected={conditions.some((x) => x.toLowerCase() === c.toLowerCase())}
                onPress={() => setConditions((cur) => toggleCondition(cur, c))}
              />
            ))}
          </View>
          {conditions.some(isHeartCondition) ? (
            <Text accessibilityRole="alert" style={{ color: colors.warningText, ...typography.meta, lineHeight: 18 }}>
              Heart condition selected: please check with your doctor before starting a new exercise plan.
            </Text>
          ) : null}

          <GroupHeader>Any current injuries?</GroupHeader>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {INJURIES.map((i) => (
              <Chip
                key={i}
                label={i}
                variant="outlined"
                selected={injuries.includes(i)}
                onPress={() => setInjuries((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
              />
            ))}
          </View>

          {hasAnswers ? (
            <View style={{ gap: spacing.xs }}>
              <CheckboxField
                checked={consent}
                onChange={setConsent}
                label={`I consent to ${BRAND_NAME} using this health information only to adjust my workouts and provide safer guidance`}
              >
                <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textPrimary }}>
                  I consent to {BRAND_NAME} using this health information only to adjust my workouts and provide safer guidance.
                </Text>
              </CheckboxField>
              <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 18 }}>
                Optional. Without consent, your selected conditions and injuries are discarded and not stored or used. You can review and
                withdraw this consent later in Data & Privacy.
              </Text>
            </View>
          ) : null}

          <Button label="Save" onPress={onSave} loading={saving} disabled={saving || (hasAnswers && !consent)} />
          <Button label={skipped ? "Skip for now" : "Cancel"} variant="secondary" onPress={() => navigation.goBack()} disabled={saving} />
        </>
      ) : null}
    </RecoverShell>
  );
}
