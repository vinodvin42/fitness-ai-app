import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AccentColor, UnitSystem } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Preferences">;

const UNIT_SYSTEMS: UnitSystem[] = ["metric", "imperial"];
const UNIT_LABELS: Record<UnitSystem, string> = { metric: "Metric (kg, cm)", imperial: "Imperial (lb, in)" };

// Reuses existing semantic tokens rather than inventing new brand colors —
// tokens.ts itself notes these are eyeballed, not a locked spec.
const ACCENT_SWATCHES: Record<AccentColor, string> = {
  blue: colors.accent,
  green: colors.success,
  yellow: colors.warning,
  red: colors.danger,
};
const ACCENT_COLORS: AccentColor[] = ["blue", "green", "yellow", "red"];

/**
 * Preferences (docs/mobile/03-screen-inventory.md §N) — Phase 1 scope:
 * unit system + accent color, both persisted via `PATCH /users/me`. Not
 * built: dark-mode toggle (the app is dark-only, no light theme exists to
 * switch to) and a sound toggle (folded into Reminders' own per-reminder
 * `playSound`, not a separate global setting). Language selection and a
 * notifications master toggle *are* built now, but live under Settings
 * (§L) rather than here — see SettingsHub -> Language /
 * SettingsHub -> Notifications, added Phase 4. IMPORTANT caveat: saving
 * an accent color here persists it correctly, but `colors.accent` in
 * theme/tokens.ts is a static constant, not wired to re-render the app in
 * the chosen color — real re-theming needs tokens.ts converted into a
 * context/provider, which is out of scope for this pass (gap §11).
 */
export function PreferencesScreen({ navigation: _navigation }: Props) {
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(user?.unitSystem ?? "metric");
  const [accentColor, setAccentColor] = useState<AccentColor>(user?.accentColor ?? "blue");
  const [isSaving, setIsSaving] = useState(false);

  const onSelectUnitSystem = async (next: UnitSystem) => {
    const previous = unitSystem;
    setUnitSystem(next);
    setIsSaving(true);
    try {
      await updateProfile({ unitSystem: next });
    } catch (err) {
      setUnitSystem(previous);
      Alert.alert("Couldn't save preference", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const onSelectAccentColor = async (next: AccentColor) => {
    const previous = accentColor;
    setAccentColor(next);
    setIsSaving(true);
    try {
      await updateProfile({ accentColor: next });
    } catch (err) {
      setAccentColor(previous);
      Alert.alert("Couldn't save preference", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenContainer title={t("settings.preferences")}>
      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("settings.unitSystem")}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {UNIT_SYSTEMS.map((us) => (
            <Chip key={us} label={UNIT_LABELS[us]} selected={unitSystem === us} onPress={() => onSelectUnitSystem(us)} />
          ))}
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("settings.accentColor")}</Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {ACCENT_COLORS.map((ac) => (
            <Pressable key={ac} onPress={() => onSelectAccentColor(ac)}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.pill,
                  backgroundColor: ACCENT_SWATCHES[ac],
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: accentColor === ac ? 3 : 0,
                  borderColor: colors.textPrimary,
                }}
              >
                {accentColor === ac ? <Icon name="check" size={20} color="#0B0B0F" strokeWidth={3} /> : null}
              </View>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
          {isSaving ? "Saving…" : "Saved — full app re-theming isn't wired yet, see code comment."}
        </Text>
      </Card>
    </ScreenContainer>
  );
}
