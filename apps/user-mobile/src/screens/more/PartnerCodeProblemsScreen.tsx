import React from "react";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { OutlineButton } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "PartnerCodeProblems">;
type Reason = "not_found" | "expired" | "already_linked";

const CARDS: Array<{ reason: Reason; tag: string; tone: string; body: (code?: string) => string }> = [
  {
    reason: "not_found",
    tag: "Code not found",
    tone: colors.warning,
    body: (code) =>
      `${code ? `"${code}" doesn't` : "A code that doesn't"} match any partner. Check the spelling or ask who gave it to you.`,
  },
  {
    reason: "expired",
    tag: "Code expired",
    tone: colors.danger,
    body: (code) => `${code ? `"${code}" is` : "An expired code is"} no longer active. Ask your gym for their current code.`,
  },
  {
    reason: "already_linked",
    tag: "You already have a code",
    tone: colors.accent,
    body: () => "Your account is already linked to a partner code. Use Change partner code to switch to a different one.",
  },
];

/**
 * Code problems, explained (Figma Profile & Settings 15). Opened after a
 * failed link with the matching reason (and the code that was tried)
 * highlighted, or from "Having trouble with a code?" with all three cases.
 */
export function PartnerCodeProblemsScreen({ navigation, route }: Props) {
  const { reason, code } = route.params ?? {};
  return (
    <RecoverShell centered title="Partner code" onBack={() => navigation.goBack()}>
      <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 20 }}>Code problems, explained</Text>
      <View style={{ gap: spacing.sm }}>
        {CARDS.map((c) => (
          <View
            key={c.reason}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: reason === c.reason ? c.tone : colors.border,
              padding: 14,
              gap: 6,
            }}
          >
            <Text style={{ color: c.tone, fontFamily: fonts.bodySemi, fontSize: 11 }}>{c.tag}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{c.body(c.reason === reason ? code : undefined)}</Text>
          </View>
        ))}
      </View>
      <Button label="Try another code" onPress={() => navigation.navigate("PartnerCode")} />
      <OutlineButton label="Contact support" onPress={() => navigation.navigate("Support")} />
    </RecoverShell>
  );
}
