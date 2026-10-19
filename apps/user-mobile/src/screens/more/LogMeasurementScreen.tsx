import React, { useState } from "react";
import { Alert, Pressable, Switch, Text, TextInput, View } from "react-native";
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
import { SegmentedControl } from "../../components/SegmentedControl";
import { GUIDED_LOG_ORDER, MEASUREMENT_PARTS } from "../../lib/measurementParts";
import { useTheme } from "../../theme/ThemeProvider";
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
 *
 * Oct 2026 (Figma 06b measure-04): opens in a one-part-at-a-time mode with a
 * ±0.5 cm stepper, the tape tip and "Same as last time"; "All fields" shows
 * the form above (weight, body fat and forearms live there). Both modes share
 * the same entries, so switching never loses what was typed.
 */
export function LogMeasurementScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const units = useMeasureUnits();
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<"guided" | "all">("guided");
  const [step, setStep] = useState(0);
  const { colors: theme } = useTheme();
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

  // ---- One part at a time (Figma 06b measure-04)
  const lenStep = units.lenUnit === "in" ? 0.25 : 0.5;
  const lastOn = (key: FieldKey): string | null => {
    for (const r of rows ?? []) {
      if (typeof r[key as keyof typeof r] === "number") return new Date(r.loggedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    }
    return null;
  };
  const renderGuided = () => {
    if (step >= GUIDED_LOG_ORDER.length) {
      const entered = GUIDED_LOG_ORDER.map((k) => MEASUREMENT_PARTS[k]).filter((p) => values[p.field]?.trim());
      return (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Review</Text>
          {entered.length === 0 ? (
            <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>Nothing entered yet. Go back, or add weight in All fields.</Text>
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {entered.map((p, i) => (
                <View
                  key={p.key}
                  style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{p.label}</Text>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>
                    {values[p.field]} {units.lenUnit}
                  </Text>
                </View>
              ))}
            </Card>
          )}
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Pressable onPress={() => setStep(GUIDED_LOG_ORDER.length - 1)} accessibilityRole="button" hitSlop={6}>
              <Text style={{ color: theme.accentText, ...typography.label, fontSize: 14 }}>‹ Back</Text>
            </Pressable>
            <Pressable onPress={() => setMode("all")} accessibilityRole="button" hitSlop={6}>
              <Text style={{ color: theme.accentText, ...typography.label, fontSize: 14 }}>Add weight or body fat</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    const part = MEASUREMENT_PARTS[GUIDED_LOG_ORDER[step]];
    const next = GUIDED_LOG_ORDER[step + 1] ? MEASUREMENT_PARTS[GUIDED_LOG_ORDER[step + 1]] : null;
    const raw = values[part.field] ?? "";
    const last = latestOf(part.field);
    const lastDisplay = last != null ? units.len(last) : null;
    const set = (text: string) => setValues((prev) => ({ ...prev, [part.field]: text }));
    const bump = (dir: 1 | -1) => {
      const base = parseFloat(raw.replace(",", ".")) || lastDisplay || 0;
      const nextVal = Math.max(lenStep, Math.round((base + dir * lenStep) / lenStep) * lenStep);
      set(nextVal.toFixed(lenStep < 0.5 ? 2 : 1));
    };
    const stepBtn = (label: string, dir: 1 | -1) => (
      <Pressable
        onPress={() => bump(dir)}
        accessibilityRole="button"
        accessibilityLabel={`${dir > 0 ? "Plus" : "Minus"} ${lenStep} ${units.lenUnit}`}
        style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 20 }}>{label}</Text>
      </Pressable>
    );
    return (
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.textSecondary, ...typography.label }}>
            {step + 1} of {GUIDED_LOG_ORDER.length}
          </Text>
          <View style={{ flexDirection: "row", gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {GUIDED_LOG_ORDER.map((k, i) => (
              <View key={k} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? theme.accent : colors.surfaceHigh }} />
            ))}
          </View>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 24 }}>{part.label}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>{part.tip}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {stepBtn("−", -1)}
          <View
            style={{
              flex: 1,
              height: 56,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: theme.accent,
              backgroundColor: colors.surface,
            }}
          >
            <TextInput
              value={raw}
              onChangeText={set}
              keyboardType="decimal-pad"
              placeholder={lastDisplay != null ? String(lastDisplay) : "—"}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={`${part.label} in ${units.lenUnit}`}
              style={{ minWidth: 70, textAlign: "center", color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 26 }}
            />
            <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{units.lenUnit}</Text>
          </View>
          {stepBtn("+", 1)}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
          <Text style={{ flex: 1, color: colors.textMuted, ...typography.meta }}>
            Steps of {lenStep} {units.lenUnit}
            {lastDisplay != null ? ` · last ${lastDisplay} on ${lastOn(part.field)}` : ""}
          </Text>
          {lastDisplay != null ? (
            <Pressable
              onPress={() => set(String(lastDisplay))}
              accessibilityRole="button"
              accessibilityLabel={`Same as last time, ${lastDisplay} ${units.lenUnit}`}
              style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 13 }}>Same as last time</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button
            label="Skip"
            variant="secondary"
            onPress={() => {
              set("");
              setStep(step + 1);
            }}
            style={{ flex: 1 }}
          />
          <Button
            label={next ? `Next: ${next.label}` : "Review"}
            disabled={!raw.trim()}
            onPress={() => setStep(step + 1)}
            style={{ flex: 2 }}
          />
        </View>
        {step > 0 ? (
          <Pressable onPress={() => setStep(step - 1)} accessibilityRole="button" hitSlop={6} style={{ alignSelf: "center" }}>
            <Text style={{ color: theme.accentText, ...typography.label, fontSize: 14 }}>
              ‹ Back to {MEASUREMENT_PARTS[GUIDED_LOG_ORDER[step - 1]].label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <ScreenContainer
      title="Log Measurements"
      subtitle="Use a measuring tape for accuracy"
      right={
        <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
          <Text style={{ color: colors.accentText, ...typography.caption }}>{today}</Text>
        </View>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <SegmentedControl
            options={[
              { value: "guided", label: "One at a time" },
              { value: "all", label: "All fields" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
        <View style={{ width: 96 }}>
          <SegmentedControl
            options={[
              { value: "cm", label: "cm" },
              { value: "in", label: "in" },
            ]}
            value={units.lenUnit}
            onChange={(v) => units.setImperial(v === "in")}
          />
        </View>
      </View>

      {mode === "guided" ? renderGuided() : null}

      {mode === "all" ? GROUPS.map((g) => (
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
                  style={{ color: colors.accentText, fontFamily: fonts.bodyBold, fontSize: 14, textAlign: "right", minWidth: 70, paddingVertical: 10 }}
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
      )) : null}

      {mode === "all" ? (
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 14 }}>Use inches instead of cm</Text>
          <Switch
            accessibilityLabel="Use inches instead of centimetres"
            value={units.isImperial}
            onValueChange={units.setImperial}
            trackColor={{ true: colors.accent, false: colors.surfaceHigh }}
          />
        </Card>
      ) : null}

      {mode === "all" || step >= GUIDED_LOG_ORDER.length ? (
        <Button label="Save Measurements" onPress={onSubmit} loading={isSubmitting} disabled={!canSubmit} />
      ) : null}
    </ScreenContainer>
  );
}
