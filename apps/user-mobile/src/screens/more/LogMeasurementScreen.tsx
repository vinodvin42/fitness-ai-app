import React, { useState } from "react";
import { Alert, Switch, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { LogMeasurementInput } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { fetchMeasurements, logMeasurement } from "../../api/progress";
import { extractErrorMessage } from "../../lib/apiError";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "LogMeasurement">;

type FieldKey = Exclude<keyof LogMeasurementInput, never>;

interface FieldDef {
  key: FieldKey;
  label: string;
  kind: "len" | "wt" | "pct";
}

const GROUPS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: "Upper Body",
    fields: [
      { key: "neckCm", label: "Neck", kind: "len" },
      { key: "chestCm", label: "Chest", kind: "len" },
      { key: "shouldersCm", label: "Shoulders", kind: "len" },
      { key: "bicepLeftCm", label: "Bicep Left", kind: "len" },
      { key: "bicepRightCm", label: "Bicep Right", kind: "len" },
      { key: "forearmLeftCm", label: "Forearm Left", kind: "len" },
      { key: "forearmRightCm", label: "Forearm Right", kind: "len" },
    ],
  },
  {
    title: "Core",
    fields: [
      { key: "waistCm", label: "Waist", kind: "len" },
      { key: "hipsCm", label: "Hips", kind: "len" },
    ],
  },
  {
    title: "Lower Body",
    fields: [
      { key: "thighLeftCm", label: "Thigh Left", kind: "len" },
      { key: "thighRightCm", label: "Thigh Right", kind: "len" },
      { key: "calfLeftCm", label: "Calf Left", kind: "len" },
      { key: "calfRightCm", label: "Calf Right", kind: "len" },
    ],
  },
  {
    title: "Additional",
    fields: [
      { key: "weightKg", label: "Weight", kind: "wt" },
      { key: "bodyFatPercent", label: "Body Fat % (User Entered)", kind: "pct" },
    ],
  },
];

/**
 * Log Measurements (Figma Progress 04): a grouped tape-measure form. Values
 * are stored in cm/kg whatever the display unit; the "Use inches instead of
 * cm" toggle converts what you type (and the placeholders, which show your
 * last logged value) and is remembered on this device. Every field is
 * optional; at least one is required.
 */
export function LogMeasurementScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const units = useMeasureUnits();
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: rows } = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });

  const canSubmit = Object.values(values).some((v) => v.trim().length > 0);

  const latestOf = (key: FieldKey): number | null => {
    for (const r of rows ?? []) {
      const v = r[key as keyof typeof r];
      if (typeof v === "number") return v;
    }
    return null;
  };

  const placeholderFor = (f: FieldDef): string => {
    const last = latestOf(f.key);
    if (last == null) return f.kind === "pct" ? "%" : f.kind === "wt" ? units.wtUnit : units.lenUnit;
    if (f.kind === "pct") return String(last);
    return String(f.kind === "wt" ? units.wt(last) : units.len(last));
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    const input: Record<string, number> = {};
    for (const g of GROUPS) {
      for (const f of g.fields) {
        const raw = values[f.key]?.trim().replace(",", ".");
        if (!raw) continue;
        const n = parseFloat(raw);
        if (!Number.isFinite(n) || n <= 0) {
          Alert.alert("Check your entry", `${f.label} must be a number greater than 0.`);
          return;
        }
        const stored = f.kind === "len" ? units.toCm(n) : f.kind === "wt" ? units.toKg(n) : n;
        input[f.key] = Math.round(stored * 10) / 10;
      }
    }
    setIsSubmitting(true);
    try {
      await logMeasurement(input as LogMeasurementInput);
      await queryClient.invalidateQueries({ queryKey: ["progress"] });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save measurements", extractErrorMessage(err, "Check your values and connection, then try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <ScreenContainer
      title="Log Measurements"
      subtitle="Use a measuring tape for accuracy"
      right={
        <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
          <Text style={{ color: colors.accent, ...typography.caption }}>{today}</Text>
        </View>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />

      {GROUPS.map((g) => (
        <View key={g.title} style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textSecondary, ...typography.label, marginTop: spacing.xs }}>{g.title}</Text>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {g.fields.map((f, i) => (
              <View
                key={f.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: spacing.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                  minHeight: 46,
                }}
              >
                <Text style={{ color: colors.textPrimary, flex: 1, ...typography.body, fontSize: 14 }}>{f.label}</Text>
                <TextInput
                  accessibilityLabel={`${f.label} ${f.kind === "len" ? units.lenUnit : f.kind === "wt" ? units.wtUnit : "percent"}`}
                  style={{ color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 14, textAlign: "right", minWidth: 70, paddingVertical: 10 }}
                  placeholder={placeholderFor(f)}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={values[f.key] ?? ""}
                  onChangeText={(text) => setValues((prev) => ({ ...prev, [f.key]: text }))}
                />
                <Text style={{ color: colors.textMuted, ...typography.meta, width: 26, textAlign: "right" }}>
                  {f.kind === "len" ? units.lenUnit : f.kind === "wt" ? units.wtUnit : "%"}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ))}

      <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 14 }}>Use inches instead of cm</Text>
        <Switch
          accessibilityLabel="Use inches instead of centimetres"
          value={units.isImperial}
          onValueChange={units.setImperial}
          trackColor={{ true: colors.accent, false: colors.surfaceHigh }}
        />
      </Card>

      <Button label="Save Measurements" onPress={onSubmit} loading={isSubmitting} disabled={!canSubmit} />
    </ScreenContainer>
  );
}
