import React, { useState } from "react";
import { BRAND_NAME } from "@fitness-ai-app/config";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandMark } from "./BrandMark";
import { colors, radius, spacing } from "../theme/tokens";

/** Width at which the login and sign-up screens split into a brand panel and a form panel (web on a laptop or tablet). */
const WIDE = 900;

/**
 * Frame shared by the signed-out screens. Wide screens get a brand panel on
 * the left (what coaches get, in the website's own words) and the form in a
 * fixed-width column on the right; phones get one column with the brand row
 * on top.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;

  if (wide) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.row}>
          <BrandPanel />
          <ScrollView contentContainerStyle={styles.formPane} keyboardShouldPersistTaps="handled">
            <View style={styles.formColumn}>{children}</View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.narrow} keyboardShouldPersistTaps="handled">
        <View style={styles.narrowColumn}>
          <BrandRow />
          <View style={styles.narrowForm}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BrandRow() {
  return (
    <View style={styles.brandRow}>
      <BrandMark size={36} />
      <Text style={styles.brandWord}>
        {BRAND_NAME} <Text style={styles.brandCoach}>Coach</Text>
      </Text>
    </View>
  );
}

function BrandPanel() {
  const { t } = useTranslation();
  return (
    <View style={styles.panel}>
      <BrandRow />
      <View style={styles.panelBody}>
        <Text style={styles.eyebrow}>{t("auth.layout.eyebrow")}</Text>
        <Text style={styles.headline}>
          {`${t("auth.layout.headline")}\n`}
          <Text style={styles.headlineAccent}>{t("auth.layout.headlineAccent")}</Text>
        </Text>
        <Benefits />
      </View>
      <Text style={styles.panelFoot}>{t("auth.layout.help")}</Text>
    </View>
  );
}

function Benefits() {
  const { t } = useTranslation();
  const items = [t("auth.layout.benefitMatched"), t("auth.layout.benefitSummary"), t("auth.layout.benefitDecide")];
  return (
    <View style={styles.benefits}>
      {items.map((item) => (
        <View key={item} style={styles.benefit}>
          <View style={styles.tick}>
            <Text style={styles.tickMark}>✓</Text>
          </View>
          <Text style={styles.benefitText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** Field label shown above an input on the signed-out screens. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

/** The input style the signed-out screens share. */
export const authInputStyle = {
  height: 52,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  paddingHorizontal: spacing.md,
  color: colors.textPrimary,
  fontSize: 16,
} as const;

/** A password field with a Show/Hide switch inside it. */
export function PasswordInput({
  value,
  onChangeText,
  onSubmitEditing,
  autoComplete,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmitEditing?: () => void;
  autoComplete?: "password" | "new-password";
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <TextInput
        style={[authInputStyle, styles.passwordInput]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoComplete={autoComplete}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>{visible ? t("auth.hide") : t("auth.show")}</Text>
      </Pressable>
    </View>
  );
}

/** Text styles the login and sign-up forms share. */
export const authStyles = StyleSheet.create({
  back: { alignSelf: "flex-start", paddingVertical: 4, marginBottom: spacing.lg },
  backText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  title: { color: colors.textPrimary, fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { color: colors.textSecondary, fontSize: 16, lineHeight: 23, marginTop: spacing.xs, marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  submit: { marginTop: spacing.sm },
  switchRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: spacing.lg },
  switchText: { color: colors.textSecondary, fontSize: 14 },
  switchLink: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.md, textAlign: "center" },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  row: { flex: 1, flexDirection: "row" },

  panel: {
    // A fixed share of the window, so the panel doesn't shift as you move between welcome, login and sign-up.
    width: "44%",
    maxWidth: 620,
    backgroundColor: "#0E1512",
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 56,
    paddingVertical: 48,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  panelBody: { maxWidth: 460, gap: spacing.md },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  headline: { color: colors.textPrimary, fontSize: 48, lineHeight: 52, fontWeight: "800", letterSpacing: -1.2 },
  headlineAccent: { color: colors.accent },
  panelFoot: { color: colors.textMuted, fontSize: 13, lineHeight: 19, maxWidth: 420 },

  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandWord: { color: colors.textPrimary, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  brandCoach: { color: colors.accent, fontWeight: "800" },

  benefits: { gap: 14, marginTop: spacing.sm },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tick: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  tickMark: { color: "#0B0B0F", fontSize: 13, fontWeight: "800" },
  benefitText: { flex: 1, color: colors.textPrimary, fontSize: 16, lineHeight: 23 },

  formPane: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 48, paddingVertical: 48 },
  formColumn: { width: "100%", maxWidth: 400 },

  narrow: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  narrowColumn: { flex: 1, width: "100%", maxWidth: 480, alignSelf: "center" },
  narrowForm: { flex: 1, justifyContent: "center", marginTop: spacing.xl },

  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 6 },
  passwordInput: { paddingRight: 76 },
  toggle: { position: "absolute", right: 6, top: 6, bottom: 6, paddingHorizontal: 12, justifyContent: "center", borderRadius: 8 },
  toggleText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
});
