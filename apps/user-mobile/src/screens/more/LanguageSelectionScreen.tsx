import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { LANGUAGES } from "../../lib/languages";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";

type Props = NativeStackScreenProps<MoreStackParamList, "LanguageSelection">;

/**
 * Choose Your Language (Figma Profile & Settings 07): search, a two-column
 * grid of the ten supported languages with a radio, and Save. The choice is
 * saved to `User.languagePreference`. Real translation is not built, so the
 * screen says plainly that app text stays English for now.
 */
export function LanguageSelectionScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const { colors: theme } = useTheme();
  const saved = user?.languagePreference ?? "en";
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(saved);
  const [isSaving, setIsSaving] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = LANGUAGES.filter((l) => !q || l.english.toLowerCase().includes(q) || l.native.toLowerCase().includes(q));

  const onSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile({ languagePreference: selected });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save language", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <RecoverShell centered title="Language" onBack={() => navigation.goBack()}>
      <View>
        <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>Choose Your Language</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 4 }}>Pick the language you prefer to use</Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
        }}
      >
        <Icon name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={{ flex: 1, minHeight: 44, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 14 }}
          placeholder="Search languages..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search languages"
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }} accessibilityRole="radiogroup">
        {filtered.map((l) => {
          const on = selected === l.code;
          return (
            <Pressable
              key={l.code}
              onPress={() => setSelected(l.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={l.english}
              style={{
                width: "48.5%",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: on ? theme.accentSoft : colors.surface,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: on ? theme.accent : colors.border,
                paddingHorizontal: 14,
                paddingVertical: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 17 }} numberOfLines={1}>
                  {l.native}
                </Text>
                <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{l.english}</Text>
              </View>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: on ? theme.accent : colors.borderStrong,
                  backgroundColor: on ? theme.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <Icon name="check" size={12} color={theme.textOnAccent} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {filtered.length === 0 ? <Text style={{ color: colors.textSecondary }}>No languages match "{query}".</Text> : null}

      <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 18 }}>
        App text is English for now; your choice is saved for when translations ship.
      </Text>

      <Button label="Save" onPress={onSave} loading={isSaving} disabled={selected === saved} />
    </RecoverShell>
  );
}
