import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { UnitPreferences } from "@fitness-ai-app/types";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { resolveUnits } from "../../lib/measureUnits";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { UnitToggle } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "MeasurementUnits">;

type Key = keyof UnitPreferences;

const ROWS: Array<{ key: Key; label: string; options: Array<{ value: string; label: string }> }> = [
  { key: "weight", label: "Weight Units", options: [{ value: "kg", label: "kg" }, { value: "lb", label: "lbs" }] },
  { key: "height", label: "Height Units", options: [{ value: "cm", label: "cm" }, { value: "ft", label: "ft" }] },
  { key: "distance", label: "Distance Units", options: [{ value: "km", label: "km" }, { value: "mi", label: "miles" }] },
  { key: "temperature", label: "Temperature", options: [{ value: "C", label: "°C" }, { value: "F", label: "°F" }] },
  { key: "water", label: "Water Volume", options: [{ value: "ml", label: "ml" }, { value: "oz", label: "oz" }] },
];

/**
 * Measurement Units (Figma Profile & Settings 05). Each measure is saved on
 * the account (`User.unitPreferences`) the moment it changes. Data is always
 * stored metric, so changing a unit only changes how values are shown and
 * typed; history is converted on the fly, never rewritten. The legacy
 * metric/imperial `unitSystem` is kept in step (imperial only when weight and
 * height are both imperial) so older screens stay consistent.
 */
export function MeasurementUnitsScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const [prefs, setPrefs] = useState<Required<UnitPreferences>>(() => ({
    ...resolveUnits(user?.unitPreferences, user?.unitSystem),
  }));

  const onChange = async (key: Key, value: string) => {
    const previous = prefs;
    const next = { ...prefs, [key]: value } as Required<UnitPreferences>;
    setPrefs(next);
    try {
      await updateProfile({
        unitPreferences: next,
        unitSystem: next.weight === "lb" && next.height === "ft" ? "imperial" : "metric",
      });
    } catch (err) {
      setPrefs(previous);
      Alert.alert("Couldn't save units", extractErrorMessage(err, "Check your connection and try again."));
    }
  };

  return (
    <RecoverShell centered title="Measurement Units" onBack={() => navigation.goBack()}>
      <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 18 }}>
        Choose your preferred units for tracking fitness metrics. These settings configure your metrics across all
        exercises, fuel logs, and analytics.
      </Text>

      <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.8 }}>PREFERENCE GROUPS</Text>
      <View style={{ gap: spacing.sm }}>
        {ROWS.map((r) => (
          <View
            key={r.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{r.label}</Text>
            <UnitToggle
              label={r.label}
              options={r.options}
              value={prefs[r.key] as string}
              onChange={(v) => void onChange(r.key, v)}
            />
          </View>
        ))}
      </View>

      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.sm, lineHeight: 18 }}>
        Changes will be applied across all tracking features and historical charts automatically.
      </Text>
    </RecoverShell>
  );
}
