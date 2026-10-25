import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { HealthspanAnswers, PaDuration, PaFrequency, PaIntensity } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { SelectCard } from "../../components/SelectCard";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchHealthspan, HEALTHSPAN_KEY, saveHealthspanAnswers } from "../../api/healthspan";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "HealthspanAnswers">;

// The HUNT questionnaire's wording (the activity index the fitness model was built on).
const FREQUENCY: Array<{ value: PaFrequency; label: string }> = [
  { value: "never", label: "Never" },
  { value: "less_than_weekly", label: "Less than once a week" },
  { value: "weekly", label: "Once a week" },
  { value: "two_three_weekly", label: "2–3 times a week" },
  { value: "almost_daily", label: "Almost every day" },
];
const INTENSITY: Array<{ value: PaIntensity; label: string; sub: string }> = [
  { value: "easy", label: "Easy", sub: "I don't get out of breath or sweat" },
  { value: "breathless", label: "Hard", sub: "I get out of breath and sweat" },
  { value: "near_exhaustion", label: "Very hard", sub: "I push myself close to exhaustion" },
];
const DURATION: Array<{ value: PaDuration; label: string }> = [
  { value: "under_15", label: "Less than 15 minutes" },
  { value: "from_15_to_29", label: "15–29 minutes" },
  { value: "from_30_to_60", label: "30 minutes to 1 hour" },
  { value: "over_60", label: "More than 1 hour" },
];
const SMOKING: Array<{ value: NonNullable<HealthspanAnswers["smoking"]>; label: string }> = [
  { value: "never", label: "Never smoked" },
  { value: "former", label: "Used to smoke" },
  { value: "current", label: "Smoke now" },
];

/**
 * Healthspan answers (25 Oct 2026): the three HUNT activity questions behind
 * the fitness-age estimate, and smoking and blood-pressure medicine for heart
 * age. Stored encrypted on the server (OnboardingProfile.healthspanEnc).
 */
export function HealthspanAnswersScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: HEALTHSPAN_KEY, queryFn: fetchHealthspan });
  const [frequency, setFrequency] = useState<PaFrequency | null>(null);
  const [intensity, setIntensity] = useState<PaIntensity | null>(null);
  const [duration, setDuration] = useState<PaDuration | null>(null);
  const [smoking, setSmoking] = useState<HealthspanAnswers["smoking"] | null>(null);
  const [bpMedication, setBpMedication] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded || !q.data) return;
    const a = q.data.answers;
    setFrequency(a.activity?.frequency ?? null);
    setIntensity(a.activity?.intensity ?? null);
    setDuration(a.activity?.duration ?? null);
    setSmoking(a.smoking ?? null);
    setBpMedication(a.bpMedication ?? null);
    setLoaded(true);
  }, [q.data, loaded]);

  const exercises = frequency != null && frequency !== "never";
  const activityComplete = frequency === "never" || (exercises && intensity != null && duration != null);

  const save = useMutation({
    mutationFn: () =>
      saveHealthspanAnswers({
        ...(smoking ? { smoking } : {}),
        ...(bpMedication != null ? { bpMedication } : {}),
        ...(activityComplete && frequency ? { activity: { frequency, intensity: exercises ? intensity : null, duration: exercises ? duration : null } } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HEALTHSPAN_KEY });
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't save", extractErrorMessage(err, "Please try again.")),
  });

  const canSave = (smoking != null || bpMedication != null || activityComplete) && !(exercises && !activityComplete);

  return (
    <ScreenContainer title="Your answers" subtitle="For fitness age and heart age · kept private" onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <SkeletonCard lines={5} />
      ) : (
        <>
          <SectionHeader title="How often do you exercise?" />
          <View style={{ gap: spacing.sm }}>
            {FREQUENCY.map((o) => (
              <SelectCard key={o.value} title={o.label} selected={frequency === o.value} onPress={() => setFrequency(o.value)} />
            ))}
          </View>

          {exercises ? (
            <>
              <SectionHeader title="How hard, usually?" />
              <View style={{ gap: spacing.sm }}>
                {INTENSITY.map((o) => (
                  <SelectCard key={o.value} title={o.label} subtitle={o.sub} selected={intensity === o.value} onPress={() => setIntensity(o.value)} />
                ))}
              </View>
              <SectionHeader title="How long each time?" />
              <View style={{ gap: spacing.sm }}>
                {DURATION.map((o) => (
                  <SelectCard key={o.value} title={o.label} selected={duration === o.value} onPress={() => setDuration(o.value)} />
                ))}
              </View>
            </>
          ) : null}

          <SectionHeader title="Do you smoke?" />
          <View style={{ gap: spacing.sm }}>
            {SMOKING.map((o) => (
              <SelectCard key={o.value} title={o.label} selected={smoking === o.value} onPress={() => setSmoking(o.value)} />
            ))}
          </View>

          <SectionHeader title="Do you take medicine for blood pressure?" />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <SelectCard title="Yes" selected={bpMedication === true} onPress={() => setBpMedication(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <SelectCard title="No" selected={bpMedication === false} onPress={() => setBpMedication(false)} />
            </View>
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            These answers are stored encrypted and are only used to work out your estimates.
          </Text>
          <Button label="Save answers" onPress={() => save.mutate()} loading={save.isPending} disabled={!canSave || save.isPending} />
        </>
      )}
    </ScreenContainer>
  );
}
