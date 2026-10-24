import React from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Icon } from "../../components/Icon";
import { setSuggestionMode, useDailyReviewStore } from "../../lib/dailyReviewStore";
import type { SuggestionMode } from "../../lib/dailySuggestions";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { LearnMoreLink } from "../../components/LearnMoreSheet";

type Props = NativeStackScreenProps<MoreStackParamList, "SuggestionsSettings">;

export const SUGGESTION_MODE_LABEL: Record<SuggestionMode, string> = {
  ask: "Ask me (daily review)",
  weekly: "Weekly summary (Sunday)",
  off: "Off — follow my plan only",
};
const MODES: SuggestionMode[] = ["ask", "weekly", "off"];

/**
 * Settings › Suggestions (Figma 02b settings/suggestions). Chooses when the
 * Today daily review appears. Stored on this device only (owner decision,
 * 18 Oct 2026). Figma's "Direct adjust is in Settings › Professionals" isn't
 * shown: professionals can't adjust plans in this build.
 */
export function SuggestionsSettingsScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const { ready, mode } = useDailyReviewStore();

  return (
    <RecoverShell centered title="Suggestions" onBack={() => navigation.goBack()}>
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14, lineHeight: 20 }}>
        At most 1–2 ideas a day: after hard sessions, a low recovery score, or several hard weeks if Workout settings › Suggest lighter weeks is on.
      </Text>
      <Text style={{ color: colors.textMuted, ...typography.label, marginTop: spacing.sm }}>Choose one · default: Ask me</Text>
      <View accessibilityRole="radiogroup" style={{ borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
        {MODES.map((m, i) => {
          const selected = ready && mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setSuggestionMode(m)}
              disabled={!ready}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !ready }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.md,
                minHeight: 52,
                backgroundColor: colors.surface,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{SUGGESTION_MODE_LABEL[m]}</Text>
              {selected ? <Icon name="check" size={18} color={theme.accentText} strokeWidth={3} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => navigation.navigate("ProgressSection", { screen: "DecisionHistory" })}
        accessibilityRole="button"
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.md,
          minHeight: 52,
          marginTop: spacing.sm,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>Decision history</Text>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </Pressable>
      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.lg }}>
        Nothing changes unless you say yes. This choice is saved on this phone.
      </Text>
      <View style={{ alignItems: "center" }}>
        <LearnMoreLink topic="daily_review" label="How suggestions work" />
      </View>
    </RecoverShell>
  );
}
