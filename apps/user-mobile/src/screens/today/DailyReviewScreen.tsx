import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useToast } from "../../components/Toast";
import { decideRecommendation } from "../../api/recommendations";
import { extractErrorMessage } from "../../lib/apiError";
import { localDate, type DailySuggestion, type SuggestionOutcome } from "../../lib/dailySuggestions";
import { recordSuggestionDecision } from "../../lib/dailyReviewStore";
import { LIGHTER_ROUTINE_ID, useDailyReview } from "../../lib/useDailyReview";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MainTabsParamList } from "../../navigation/MainTabs";
import type { TodayStackParamList } from "../../navigation/TodayStack";

type Props = CompositeScreenProps<
  NativeStackScreenProps<TodayStackParamList, "DailyReview">,
  BottomTabScreenProps<MainTabsParamList>
>;

/**
 * Daily review (Figma review/01–03): one suggestion per screen with its one
 * line of reason, Use it / Skip, then "All set for today". The list is fixed
 * when the screen opens so deciding one doesn't reshuffle the rest. "Go
 * lighter" changes nothing in the plan — Use it offers the gentle routine on
 * the last screen; a program switch is accepted or declined on the server,
 * exactly as Progress › Review does. There is no Decision history screen, so
 * Figma's "Open Decision history" isn't offered.
 */
export function DailyReviewScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const review = useDailyReview();
  const [items, setItems] = useState<DailySuggestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, SuggestionOutcome>>({});
  const [busy, setBusy] = useState<SuggestionOutcome | null>(null);

  useEffect(() => {
    if (items === null && review.ready) setItems(review.suggestions);
  }, [items, review.ready, review.suggestions]);

  if (items === null) {
    return (
      <ScreenContainer title="Daily review">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  const decide = async (s: DailySuggestion, outcome: SuggestionOutcome) => {
    setBusy(outcome);
    try {
      if (s.kind === "switch_program" && s.recommendationId) {
        await decideRecommendation(s.recommendationId, { action: outcome === "used" ? "accept" : "decline" });
        queryClient.invalidateQueries({ queryKey: ["recommendations", "current"] });
        queryClient.invalidateQueries({ queryKey: ["plans", "current"] });
      }
      recordSuggestionDecision({ key: s.key, kind: s.kind, date: localDate(new Date()), outcome });
      setOutcomes((o) => ({ ...o, [s.key]: outcome }));
      setIndex((i) => i + 1);
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't save that choice. Try again."), "error");
    } finally {
      setBusy(null);
    }
  };

  // Nothing (left) to review: e.g. opened after everything was decided.
  if (items.length === 0) {
    return (
      <ScreenContainer title="Daily review">
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ color: colors.textSecondary, ...typography.body }}>Nothing to review today. Your plan stays as it is.</Text>
        <Button label="Back to Today" onPress={() => navigation.goBack()} />
      </ScreenContainer>
    );
  }

  if (index >= items.length) {
    const used = items.filter((s) => outcomes[s.key] === "used");
    const skipped = items.filter((s) => outcomes[s.key] === "skipped");
    const lighterUsed = used.some((s) => s.kind === "lighter_day");
    return (
      <ScreenContainer title="Daily review">
        <BackButton onPress={() => navigation.goBack()} />
        <Pill text={`Done · ${items.length} of ${items.length} reviewed`} color={colors.successText} bg={colors.successSoft} />
        <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h1, fontSize: 24 }}>
          ✓ All set for today
        </Text>
        <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>
          {used.length} used, {skipped.length} skipped.
        </Text>
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Today's review</Text>
          {items.map((s) => (
            <View key={s.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{outcomes[s.key] === "used" ? "Used" : "Skipped"}</Text>
              <Text style={{ flex: 1, textAlign: "right", color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>{s.title}</Text>
            </View>
          ))}
        </Card>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          Next review only if something meaningful comes up. Skipped ideas don't come back this week.
        </Text>
        {lighterUsed ? (
          <Button
            label="Start gentle mobility"
            onPress={() => navigation.navigate("Recover", { screen: "GuidedSession", params: { routineId: LIGHTER_ROUTINE_ID }, initial: false })}
          />
        ) : null}
        <Button label="Back to Today" variant={lighterUsed ? "secondary" : "primary"} onPress={() => navigation.goBack()} />
      </ScreenContainer>
    );
  }

  const s = items[index];
  return (
    <ScreenContainer title="Daily review">
      <BackButton onPress={() => navigation.goBack()} />
      <Pill text={`Step ${index + 1} of ${items.length} · about 1 min`} color={colors.successText} bg={colors.successSoft} />
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h1, fontSize: 24 }}>
        ✦ {s.title}
      </Text>
      <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 14 }}>Why: {s.why}</Text>
      <Card style={{ gap: spacing.sm }}>
        {s.details.map((d) => (
          <View key={d.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{d.label}</Text>
            <Text style={{ flex: 1, textAlign: "right", color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{d.value}</Text>
          </View>
        ))}
      </Card>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        {s.kind === "switch_program"
          ? "Use it switches your plan to this program. Skip keeps your current plan."
          : "Nothing in your plan changes. A skipped idea won't come back this week."}
      </Text>
      <Button label="Use it" onPress={() => decide(s, "used")} loading={busy === "used"} disabled={busy !== null} />
      <Button label="Skip" variant="secondary" onPress={() => decide(s, "skipped")} loading={busy === "skipped"} disabled={busy !== null} />
    </ScreenContainer>
  );
}

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontFamily: fonts.bodySemi, fontSize: 13 }}>{text}</Text>
    </View>
  );
}
