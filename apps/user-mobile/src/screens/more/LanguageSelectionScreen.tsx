import React, { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SelectCard } from "../../components/SelectCard";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "LanguageSelection">;

// docs/mobile/03-screen-inventory.md §L "Language Selection" names exactly
// these 10 languages. Codes are standard ISO 639-1, matching
// `languagePreference`'s existing "en" default (users.schema.ts).
const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
  { code: "mr", label: "Marathi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
];

/**
 * Language Selection (docs/mobile/03-screen-inventory.md §L) — a
 * searchable list with radio selection, saving to the `languagePreference`
 * field that's existed on `User` since Phase 0 (PATCH /users/me). Real
 * i18n — actually translating the app's UI strings — isn't built; this
 * screen persists the preference the same way accentColor persists
 * without live re-theming (see Preferences' own doc comment / gap §11).
 * Selecting a language other than English is a real, saved choice, but
 * every screen in this build still renders English text.
 */
export function LanguageSelectionScreen({ navigation: _navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(user?.languagePreference ?? "en");
  const [isSaving, setIsSaving] = useState(false);

  const filtered = LANGUAGES.filter((lang) => lang.label.toLowerCase().includes(query.trim().toLowerCase()));

  const onSelect = async (code: string) => {
    const previous = selected;
    setSelected(code);
    setIsSaving(true);
    try {
      await updateProfile({ languagePreference: code });
    } catch (err) {
      setSelected(previous);
      Alert.alert("Couldn't save language", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenContainer title="Language">
      <TextInput
        style={styles.input}
        placeholder="Search languages"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
      />

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {filtered.map((lang) => (
          <SelectCard
            key={lang.code}
            title={lang.label}
            selected={selected === lang.code}
            onPress={() => onSelect(lang.code)}
          />
        ))}
        {filtered.length === 0 ? <Text style={{ color: colors.textSecondary }}>No languages match "{query}".</Text> : null}
      </View>

      {isSaving ? (
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>Saving…</Text>
      ) : null}
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
