import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AccentColor } from "@fitness-ai-app/types";
import { Icon } from "../../components/Icon";
import { ProgressRing } from "../../components/ProgressRing";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { BRAND_NAME } from "../../lib/brand";
import { SegmentedControl } from "../../components/SegmentedControl";
import { accentPalettes, colors, fonts, getScheme, radius, spacing, typography, themed, type ThemeMode } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { GroupHeader } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "Appearance">;

/** Swatches show the exact accent each choice applies in the current mode. */
const ACCENTS: Array<{ value: AccentColor; swatch: string; onSwatch: string; label: string }> = themed(() =>
  ([
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "yellow", label: "Yellow" },
    { value: "red", label: "Red" },
  ] as const).map((a) => ({
    ...a,
    swatch: accentPalettes[getScheme()][a.value].accent,
    onSwatch: accentPalettes[getScheme()][a.value].textOnAccent,
  })),
);

const MODES: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "Same as phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Appearance (Figma Profile & Settings 06). Theme: Same as phone / Light /
 * Dark, from the approved Figma light and dark variables (00 — FynroX Design
 * System). The choice is stored on this device by ThemeProvider. The Live Preview is a sample card drawn with the
 * current accent (not the user's data) so an accent change shows instantly.
 * The accent colour picker (live-themed through ThemeProvider) lives here
 * because the Figma has no other home for it.
 */
export function AppearanceScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const { colors: theme, mode, setMode } = useTheme();
  const [accent, setAccent] = useState<AccentColor>(user?.accentColor ?? "blue");

  const onAccent = async (next: AccentColor) => {
    const previous = accent;
    setAccent(next);
    try {
      await updateProfile({ accentColor: next });
    } catch (err) {
      setAccent(previous);
      Alert.alert("Couldn't save accent colour", extractErrorMessage(err, "Check your connection and try again."));
    }
  };

  return (
    <RecoverShell centered title="Appearance" onBack={() => navigation.goBack()}>
      <GroupHeader>Theme</GroupHeader>
      <SegmentedControl options={MODES} value={mode} onChange={setMode} />

      <GroupHeader>Live Preview</GroupHeader>
      <View
        accessibilityLabel="Sample preview of the app theme"
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Sample workout</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Preview, not your data</Text>
          </View>
          <View style={{ width: 44, height: 10, borderRadius: 5, backgroundColor: theme.accent }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <ProgressRing progress={0.75} size={64} strokeWidth={7} color={theme.accent} trackColor={colors.surfaceHigh}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 }}>75%</Text>
          </ProgressRing>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 22 }}>3.2</Text>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
              <View style={{ width: "75%", height: 5, backgroundColor: theme.accent }} />
            </View>
          </View>
        </View>
        <View style={{ height: 40, borderRadius: radius.md, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.textOnAccent, fontFamily: fonts.bodySemi, fontSize: 14 }}>Continue Training</Text>
        </View>
      </View>

      <GroupHeader>Accent colour</GroupHeader>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {ACCENTS.map((a) => (
          <Pressable
            key={a.value}
            onPress={() => void onAccent(a.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: accent === a.value }}
            accessibilityLabel={`${a.label} accent`}
            hitSlop={2}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.pill,
                backgroundColor: a.swatch,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: accent === a.value ? 3 : 0,
                borderColor: colors.textPrimary,
              }}
            >
              {accent === a.value ? <Icon name="check" size={20} color={a.onSwatch} strokeWidth={3} /> : null}
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.md }}>
        {BRAND_NAME} Theme Settings · Version {Constants.expoConfig?.version ?? ""}
      </Text>
    </RecoverShell>
  );
}
