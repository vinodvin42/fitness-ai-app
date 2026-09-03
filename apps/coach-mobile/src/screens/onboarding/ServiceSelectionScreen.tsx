import React, { useState } from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { WizardLayout } from "../../components/WizardLayout";
import { SelectCard } from "../../components/SelectCard";
import { selectServices } from "../../api/professionalOnboarding";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { OnboardingStackParamList } from "../../navigation/OnboardingStack";

type Props = NativeStackScreenProps<OnboardingStackParamList, "ServiceSelection">;

const SERVICES: { value: ProfessionalServiceType; title: string; subtitle: string }[] = [
  {
    value: "fitness",
    title: "Fitness Coaching",
    subtitle: "Workouts, posture guides, strength protocols, physical fitness coaching",
  },
  {
    value: "nutrition",
    title: "Nutrition Coaching",
    subtitle: "Nutrition plans, food logging guidance, meal coaching, dietary goal tracking",
  },
];

/**
 * docs/coach/03-screen-inventory.md §B "Service Selection" (step 1) — two
 * selectable cards, **not mutually exclusive** ("can be updated later").
 * Selecting at least one and continuing calls PUT /professionals/me/services
 * for real, then hands the selected list off to CredentialUploadScreen to
 * loop over.
 */
export function ServiceSelectionScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<ProfessionalServiceType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = (value: ProfessionalServiceType) => {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const onNext = async () => {
    setError(null);
    setLoading(true);
    try {
      await selectServices({ services: selected });
      navigation.navigate("CredentialUpload", { services: selected, index: 0 });
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't save your services. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <WizardLayout
      step={1}
      total={3}
      label="Service Selection"
      title="What do you offer?"
      subtitle="Select at least one — you can update this later."
      onNext={onNext}
      nextDisabled={selected.length === 0}
      nextLoading={loading}
    >
      <View style={{ gap: spacing.sm }}>
        {SERVICES.map((service) => (
          <SelectCard
            key={service.value}
            title={service.title}
            subtitle={service.subtitle}
            selected={selected.includes(service.value)}
            onPress={() => toggle(service.value)}
            multiSelect
          />
        ))}
      </View>
      {error ? <Text style={{ color: colors.danger, ...typography.meta, marginTop: spacing.sm }}>{error}</Text> : null}
    </WizardLayout>
  );
}
