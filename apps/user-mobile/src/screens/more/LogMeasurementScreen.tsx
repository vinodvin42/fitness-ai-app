import React, { useState } from "react";
import { Alert, Pressable, Switch, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { LogMeasurementInput } from "@fitness-ai-app/types";
import Svg, { Circle, Line } from "react-native-svg";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { FigmaArt, MeasureHeader, MiniSegment, PillChip, measureSvg } from "../../components/MeasureUi";
import { fetchMeasurements, logMeasurement } from "../../api/progress";
import { extractErrorMessage } from "../../lib/apiError";
import { useMeasureUnits } from "../../lib/measureUnits";
import { GUIDED_LOG_ORDER, LOG_MARKS, MEASUREMENT_PARTS, measureDate, type MeasurementPartKey } from "../../lib/measurementParts";
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
      { key: "upperBackCm", label: "Upper Back", kind: "len" },
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
 * ±0.5 cm stepper, the tape tip and "Same as last time"; "Enter all at once"
 * shows the form above (weight, body fat and forearms live there). Both modes
 * share the same entries, so switching never loses what was typed. 21 Oct
 * 2026: laid out like the Figma frame (header date, "3 of 10" bars beside the
 * cm/in toggle, the outline with the tape marker on the current part).
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
  const unitsToggle = (
    <MiniSegment
      options={[
        { value: "cm", label: "cm" },
        { value: "in", label: "in" },
      ]}
      value={units.lenUnit}
      onChange={(v) => units.setImperial(v === "in")}
      paddingVertical={5}
    />
  );
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
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceRaised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 20 }}>{label}</Text>
      </Pressable>
    );
    const actionStyle = { paddingVertical: 14, borderRadius: radius.md, alignItems: "center" as const, justifyContent: "center" as const };
    return (
      <View>
        {/* Figma measure-04 "progress-units": N of M with a bar per part, and cm/in. */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: INSET, paddingTop: 4, paddingBottom: 8 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>
              {step + 1} of {GUIDED_LOG_ORDER.length}
            </Text>
            <View style={{ flexDirection: "row", gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {GUIDED_LOG_ORDER.map((k, i) => (
                <View key={k} style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: i <= step ? theme.accent : colors.surfaceHigh }} />
              ))}
            </View>
          </View>
          {unitsToggle}
        </View>

        {/* Figma "outline-card": where the tape goes for this part. */}
        <View style={{ paddingHorizontal: INSET, paddingTop: 4, paddingBottom: 8 }}>
          <View style={{ height: 150, borderRadius: 16, backgroundColor: colors.surface, alignItems: "center", paddingTop: 8.4 }}>
            <View style={{ width: 72, height: 133.2 }}>
              <FigmaArt svg={measureSvg("bodyPlain")} width={72} height={133.2} />
              <TapeMark part={GUIDED_LOG_ORDER[step]} color={theme.accent} />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: INSET, paddingTop: 8, gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 20 }}>
              {part.label}
            </Text>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>{part.tip}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
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
                borderWidth: 1.5,
                borderColor: theme.accent,
                backgroundColor: colors.surface,
              }}
            >
              <TextInput
                value={raw}
                onChangeText={set}
                keyboardType="decimal-pad"
                placeholder={lastDisplay != null ? lastDisplay.toFixed(lenStep < 0.5 ? 2 : 1) : "—"}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={`${part.label} in ${units.lenUnit}`}
                style={{ minWidth: 64, textAlign: "center", color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 24 }}
              />
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>{units.lenUnit}</Text>
            </View>
            {stepBtn("+", 1)}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
            <Text style={{ flex: 1, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 }}>
              Steps of {lenStep} {units.lenUnit}
              {lastDisplay != null ? ` · last ${lastDisplay.toFixed(lenStep < 0.5 ? 2 : 1)} on ${lastOn(part.field)}` : ""}
            </Text>
            {lastDisplay != null ? (
              <PillChip raised label="Same as last time" accessibilityLabel={`Same as last time, ${lastDisplay} ${units.lenUnit}`} onPress={() => set(String(lastDisplay))} />
            ) : null}
          </View>
        </View>

        {/* Figma "actions": Skip and Next: <part>. */}
        <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: INSET, paddingTop: 32, paddingBottom: 8 }}>
          <Pressable
            onPress={() => {
              set("");
              setStep(step + 1);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Skip ${part.label}`}
            style={[actionStyle, { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>Skip</Text>
          </Pressable>
          <Pressable
            onPress={() => setStep(step + 1)}
            disabled={!raw.trim()}
            accessibilityRole="button"
            accessibilityState={{ disabled: !raw.trim() }}
            style={[actionStyle, { flex: 2, backgroundColor: theme.accent, opacity: raw.trim() ? 1 : 0.45 }]}
          >
            <Text style={{ color: theme.textOnAccent, fontFamily: fonts.bodyBold, fontSize: 14 }}>{next ? `Next: ${next.label}` : "Review"}</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", justifyContent: step > 0 ? "space-between" : "center", paddingHorizontal: INSET, paddingTop: 8 }}>
          {step > 0 ? (
            <Pressable onPress={() => setStep(step - 1)} accessibilityRole="button" hitSlop={6}>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>‹ Back to {MEASUREMENT_PARTS[GUIDED_LOG_ORDER[step - 1]].label}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setMode("all")} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>Enter all at once</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const today = measureDate(new Date().toISOString(), "dayComma");

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: INSET, paddingTop: 12 }}>
        <MeasureHeader
          title="Log Measurements"
          subtitle={mode === "guided" ? "One body part at a time" : "Use a measuring tape for accuracy"}
          onBack={() => navigation.goBack()}
          right={
            <View
              accessible
              accessibilityLabel={`Logging for ${today}`}
              style={{ padding: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 12 }}>{today}</Text>
            </View>
          }
        />
      </View>

      {mode === "guided" ? <View style={{ marginTop: -16 }}>{renderGuided()}</View> : null}

      {mode === "all" ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: INSET }}>
          <Pressable onPress={() => setMode("guided")} accessibilityRole="button" hitSlop={6}>
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>‹ One part at a time</Text>
          </Pressable>
          {unitsToggle}
        </View>
      ) : null}

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

/** Figma's sections sit 24 px in (the screen's own padding is 16). */
const INSET = 8;

/**
 * The tape on the 72×133.2 outline for the part being logged, drawn the way
 * Figma marks Waist in measure-04: a dashed tape line, a ring and a point.
 */
function TapeMark({ part, color }: { part: MeasurementPartKey; color: string }) {
  const m = LOG_MARKS[part];
  return (
    <Svg width={72} height={133.2} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
      <Line x1={m.x1} x2={m.x2} y1={m.y} y2={m.y} stroke={color} strokeWidth={1.2} strokeDasharray="2.55 1.9" />
      <Circle cx={m.point} cy={m.y} r={4.8} stroke={color} strokeWidth={1.2} fill="none" />
      <Circle cx={m.point} cy={m.y} r={2.4} fill={color} />
    </Svg>
  );
}
