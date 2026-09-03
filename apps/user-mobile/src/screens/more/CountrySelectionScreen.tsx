import React, { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { COMMON_COUNTRIES } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SelectCard } from "../../components/SelectCard";
import { Button } from "../../components/Button";
import { useAuth } from "../../context/AuthContext";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CountrySelection">;

/**
 * Country (added 26 Aug 2026, Module 09.05 Geographic's capture-method
 * decision) — same searchable single-select pattern as
 * LanguageSelectionScreen.tsx, saving straight to `User.countryCode` on
 * tap via `PATCH /users/me`. `COMMON_COUNTRIES` (packages/types) is a
 * curated ~55-country list, not exhaustive — the manual code entry below
 * covers anyone outside it, since the backend only validates the 2-letter
 * format, not list membership (see users.schema.ts's own comment).
 */
export function CountrySelectionScreen({ navigation: _navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>(user?.countryCode ?? undefined);
  const [manualCode, setManualCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const filtered = COMMON_COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  const save = async (code: string) => {
    const previous = selected;
    setSelected(code);
    setIsSaving(true);
    try {
      await updateProfile({ countryCode: code });
    } catch (err) {
      setSelected(previous);
      Alert.alert("Couldn't save country", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const onSaveManualCode = () => {
    const code = manualCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      Alert.alert("Not a valid code", "Enter exactly 2 letters, e.g. US or IN.");
      return;
    }
    setManualCode("");
    save(code);
  };

  return (
    <ScreenContainer title="Country">
      <TextInput
        style={styles.input}
        placeholder="Search countries"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
      />

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {filtered.map((c) => (
          <SelectCard key={c.code} title={c.name} selected={selected === c.code} onPress={() => save(c.code)} />
        ))}
        {filtered.length === 0 ? <Text style={{ color: colors.textSecondary }}>No countries match "{query}".</Text> : null}
      </View>

      {isSaving ? <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>Saving…</Text> : null}

      <View style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, marginBottom: spacing.xs }}>
          Don't see your country?
        </Text>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
          This list covers common markets only — enter your country's 2-letter code directly (e.g. US, IN, DE).
        </Text>
        <TextInput
          style={styles.input}
          placeholder="2-letter code"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          maxLength={2}
          value={manualCode}
          onChangeText={setManualCode}
        />
        <Button label="Set country code" variant="secondary" onPress={onSaveManualCode} style={{ marginTop: spacing.sm }} />
      </View>
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
