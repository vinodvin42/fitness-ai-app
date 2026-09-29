import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, TextInput } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { logMeasurement } from "../../api/progress";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "LogMeasurement">;

const FIELDS: Array<{ key: "weightKg" | "chestCm" | "waistCm" | "hipsCm" | "armsCm" | "thighsCm"; label: string }> = [
  { key: "weightKg", label: "Weight (kg)" },
  { key: "chestCm", label: "Chest (cm)" },
  { key: "waistCm", label: "Waist (cm)" },
  { key: "hipsCm", label: "Hips (cm)" },
  { key: "armsCm", label: "Arms (cm)" },
  { key: "thighsCm", label: "Thighs (cm)" },
];

/**
 * Log Measurements (docs/mobile/03-screen-inventory.md §F) — a manual
 * entry form paired with Body Measurements. Every field is optional
 * individually; at least one is required to submit. Always kg/cm
 * regardless of the user's unitSystem preference — imperial-unit display
 * conversion isn't wired here yet (same simplification as onboarding's
 * About You stepper).
 */
export function LogMeasurementScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = Object.values(values).some((v) => v.trim().length > 0);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const input: Record<string, number> = {};
      for (const { key } of FIELDS) {
        const raw = values[key];
        if (raw && raw.trim().length > 0) {
          input[key] = parseFloat(raw);
        }
      }
      await logMeasurement(input);
      await queryClient.invalidateQueries({ queryKey: ["progress"] });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save measurement", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer title="Log Measurement">
      <Card>
        {FIELDS.map(({ key, label }) => (
          <React.Fragment key={key}>
            <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{label}</Text>
            <TextInput
              style={[styles.input, { marginBottom: spacing.sm }]}
              placeholder={label}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={values[key] ?? ""}
              onChangeText={(text) => setValues((prev) => ({ ...prev, [key]: text }))}
            />
          </React.Fragment>
        ))}
      </Card>

      <Button label={t("common.save")} onPress={onSubmit} loading={isSubmitting} disabled={!canSubmit} style={{ marginTop: spacing.lg }} />
    </ScreenContainer>
  );
}

const styles = {
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
} as const;
