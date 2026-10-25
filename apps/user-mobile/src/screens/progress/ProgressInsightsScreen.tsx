import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { InsightCard } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon, IconName } from "../../components/Icon";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchProgressInsights } from "../../api/progress";
import { BRAND_NAME } from "../../lib/brand";
import { useToast } from "../../components/Toast";
import { recordSuggestionDecision } from "../../lib/dailyReviewStore";
import { localDate, type DailySuggestion, type SuggestionOutcome } from "../../lib/dailySuggestions";
import { useDailyReview } from "../../lib/useDailyReview";
import { useTheme } from "../../theme/ThemeProvider";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";
import { LearnMoreLink } from "../../components/LearnMoreSheet";

type Props = NativeStackScreenProps<ProgressStackParamList, "ProgressInsights">;

const KIND_ICON: Record<InsightCard["kind"], IconName> = {
  goal: "target",
  plateau: "alert-triangle",
  strength: "trending-up",
  recovery_tip: "heart-pulse",
  sleep: "moon",
};

function GoalCard({ card }: { card: InsightCard }) {
  return (
    <View style={{ borderRadius: radius.card, overflow: "hidden", padding: spacing.md, gap: spacing.sm }}>
      <Svg style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="goalGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#4F6BED" />
            <Stop offset="1" stopColor="#8B5CF6" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#goalGrad)" />
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: "rgba(255,255,255,0.8)", ...typography.caption, letterSpacing: 1 }}>GOAL PROGRESS</Text>
        <Icon name="target" size={16} color="#FFFFFF" />
      </View>
      <Text style={{ color: "#FFFFFF", ...typography.h3, fontSize: 16, lineHeight: 22 }}>{card.body}</Text>
      {card.footnote ? (
        <Text style={{ color: "rgba(255,255,255,0.75)", ...typography.caption, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.25)", paddingTop: spacing.xs, textAlign: "right" }}>
          {card.footnote}
        </Text>
      ) : null}
    </View>
  );
}

function PlainCard({ card }: { card: InsightCard }) {
  const warn = card.tone === "warning";
  const tint = warn ? colors.warning : card.tone === "positive" ? colors.success : colors.accent;
  return (
    <Card
      style={{
        gap: spacing.sm,
        borderColor: warn ? colors.warning : colors.border,
        backgroundColor: warn ? "rgba(251,191,36,0.07)" : colors.surface,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ width: 30, height: 30, borderRadius: radius.sm, backgroundColor: `${tint}22`, alignItems: "center", justifyContent: "center" }}>
          <Icon name={KIND_ICON[card.kind]} size={16} color={tint} />
        </View>
        <Text style={{ color: warn ? colors.warning : colors.textPrimary, ...typography.h3, flex: 1 }}>{card.title}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13, lineHeight: 19 }}>{card.body}</Text>
    </Card>
  );
}

/**
 * Figma progress/07 "Light week · in today's review": the same suggestion the
 * daily review offers (lib/dailySuggestions.ts lightWeekOffer), answerable
 * here too. Use it / Skip are saved exactly like the review's buttons.
 */
function LightWeekCard({ s }: { s: DailySuggestion }) {
  const { colors: theme } = useTheme();
  const toast = useToast();
  const [whyOpen, setWhyOpen] = useState(false);
  const decide = (outcome: SuggestionOutcome) => {
    recordSuggestionDecision({ key: s.key, kind: s.kind, date: localDate(new Date()), outcome, title: s.title, why: s.why, at: new Date().toISOString() });
    toast.show(outcome === "used" ? "Lighter week saved. Today will remind you." : "Kept your plan. Saved in Decision history.", "success");
  };
  const pill = (label: string, onPress: () => void, primary = false) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: primary ? theme.accent : colors.border,
        backgroundColor: primary ? theme.accent : colors.surface,
      }}
    >
      <Text style={{ color: primary ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ width: 30, height: 30, borderRadius: radius.sm, backgroundColor: `${colors.accent}22`, alignItems: "center", justifyContent: "center" }}>
          <Icon name="battery-medium" size={16} color={colors.accent} />
        </View>
        <Text style={{ color: theme.accentText, ...typography.h3, flex: 1 }}>✦ Light week · in today's review</Text>
      </View>
      <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13, lineHeight: 19 }}>
        {s.why} {s.title}? Only if you say yes.
      </Text>
      {whyOpen
        ? s.details.map((d) => (
            <View key={d.label} style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{d.label}</Text>
              <Text style={{ flex: 1, textAlign: "right", color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{d.value}</Text>
            </View>
          ))
        : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {pill("Use it", () => decide("used"), true)}
        {pill("Skip", () => decide("skipped"))}
        {pill(whyOpen ? "Hide" : "Why?", () => setWhyOpen((o) => !o))}
      </View>
    </Card>
  );
}

/**
 * Insights (Figma Progress 07). Every card comes from a documented rule over
 * the user's own logs (see apps/api progressAnalytics.service.ts getInsights:
 * goal progress, weight-loss plateau, strength trend, sleep change, recovery
 * tip). A card whose rule cannot be computed is simply not shown - nothing is
 * filled in with a generic tip.
 */
export function ProgressInsightsScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "insights"], queryFn: fetchProgressInsights });
  const { colors: theme } = useTheme();
  const lightWeek = useDailyReview().suggestions.find((s) => s.kind === "light_week");

  return (
    <ScreenContainer title={`${BRAND_NAME} Insights`} subtitle="Your Fitness Summary" onBack={() => navigation.goBack()}>
      {isLoading ? (
        <SkeletonCard lines={4} />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load your insights." onRetry={() => refetch()} />
      ) : (
        <>
          {data.cards.length === 0 ? (
            <EmptyState
              title="Not enough data for insights yet"
              subtitle="Log your weight weekly, complete workouts and add sleep or check-ins. Insights appear only when there is enough real data to support them."
            />
          ) : (
            data.cards.map((c) => (c.kind === "goal" ? <GoalCard key={c.id} card={c} /> : <PlainCard key={c.id} card={c} />))
          )}
          {lightWeek ? <LightWeekCard s={lightWeek} /> : null}
          <Pressable onPress={() => navigation.navigate("DecisionHistory")} accessibilityRole="link" hitSlop={8}>
            <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Decision history ›</Text>
          </Pressable>
          <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 18, marginTop: spacing.sm }}>{data.disclaimer}</Text>
          <LearnMoreLink topic="insights" />
        </>
      )}
    </ScreenContainer>
  );
}
