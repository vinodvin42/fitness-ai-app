import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { LANGUAGES } from "../../lib/languages";
import { BETA_LANGUAGES, TRANSLATED_LANGUAGES } from "../../i18n";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";

type Props = NativeStackScreenProps<MoreStackParamList, "LanguageSelection">;

/** Only languages the app can actually show (see TRANSLATED_LANGUAGES). */
const AVAILABLE = LANGUAGES.filter((l) => (TRANSLATED_LANGUAGES as readonly string[]).includes(l.code));

/**
 * Choose Your Language (Figma Profile & Settings 07): a two-column grid of
 * languages with a radio, and Save. The choice is saved to
 * `User.languagePreference`. Only languages with real translations are
 * listed. Search appears once the list is long enough to need it.
 *
 * Owner, 25 Oct 2026 ("add indian languages"): the nine Indian languages are offered, marked Beta: menus
 * and the screens already in the catalogue switch; the rest of the app stays English for now.
 */
export function LanguageSelectionScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const { colors: theme } = useTheme();
  const saved = user?.languagePreference ?? "en";
  const [query, setQuery] = useState("");
  // A saved language with no translation (picked on an older build) starts on English, so Save can fix it.
  const [selected, setSelected] = useState(AVAILABLE.some((l) => l.code === saved) ? saved : "en");
  const [isSaving, setIsSaving] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = AVAILABLE.filter((l) => !q || l.english.toLowerCase().includes(q) || l.native.toLowerCase().includes(q));

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

      {AVAILABLE.length > 6 ? (
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
      ) : null}

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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 13 }}>{l.english}</Text>
                  {BETA_LANGUAGES.includes(l.code) ? (
                    <View style={{ borderRadius: radius.pill, backgroundColor: colors.warningSoft, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ color: colors.warningText, fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.3 }}>BETA</Text>
                    </View>
                  ) : null}
                </View>
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
        {BETA_LANGUAGES.includes(selected)
          ? "Beta: menus and many screens switch to this language. Some screens are still in English while we translate them."
          : "Indian languages are in Beta: menus and many screens are translated, the rest is still in English."}
      </Text>

      <Button label="Save" onPress={onSave} loading={isSaving} disabled={selected === saved} />
    </RecoverShell>
  );
}
