import React from "react";
import { Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { InsightCard } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Icon, IconName } from "../../components/Icon";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchProgressInsights } from "../../api/progress";
import { BRAND_NAME } from "../../lib/brand";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

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
 * Insights (Figma Progress 07). Every card comes from a documented rule over
 * the user's own logs (see apps/api progressAnalytics.service.ts getInsights:
 * goal progress, weight-loss plateau, strength trend, sleep change, recovery
 * tip). A card whose rule cannot be computed is simply not shown - nothing is
 * filled in with a generic tip.
 */
export function ProgressInsightsScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["progress", "insights"], queryFn: fetchProgressInsights });

  return (
    <ScreenContainer title={`${BRAND_NAME} Insights`} subtitle="Your Fitness Summary">
      <BackButton onPress={() => navigation.goBack()} />
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
          <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 16, marginTop: spacing.sm }}>{data.disclaimer}</Text>
        </>
      )}
    </ScreenContainer>
  );
}
