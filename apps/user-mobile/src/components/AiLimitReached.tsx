import React from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { AiCoachUsage, SubscriptionPlan } from "@fitness-ai-app/types";
import { fetchPlans } from "../api/subscriptions";
import { InfoCard, StateLayout } from "./StatePanels";
import { colors, radius, spacing, typography } from "../theme/tokens";

const TIER_LABEL: Record<AiCoachUsage["tier"], string> = { basic: "Basic", pro: "Pro", elite: "Elite" };

interface AiLimitReachedProps {
  usage: AiCoachUsage | undefined;
  onUpgrade: () => void;
  onKeepTracking: () => void;
  onBack: () => void;
}

function monthlyLabel(plan: SubscriptionPlan) {
  return `₹${(plan.priceCents / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}/month`;
}

/**
 * Figma AI 03 - plan limit reached. Follows the frame's copy and does not show
 * a request count; the reset time is shown because GET /ai-coach/usage returns
 * a real one. The plan names and prices are the live subscription plans
 * (GET /subscription-plans), never hard-coded; "Compare ..." opens Subscription.
 */
export function AiLimitReached({ usage, onUpgrade, onKeepTracking, onBack }: AiLimitReachedProps) {
  const plansQuery = useQuery({ queryKey: ["subscription-plans"], queryFn: fetchPlans });
  const tier = usage ? TIER_LABEL[usage.tier] : null;
  const tierName = tier ?? "Basic";
  const resets = usage
    ? new Date(usage.resetsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
    : null;

  const all = plansQuery.data ?? [];
  const currentIsFree = usage ? all.some((p) => p.tier === usage.tier && p.priceCents === 0) : false;
  // Paid monthly plans on a different tier than the user's current one, cheapest first.
  const options = all
    .filter((p) => p.billingCycle === "monthly" && p.priceCents > 0 && (!usage || p.tier !== usage.tier))
    .sort((a, b) => a.priceCents - b.priceCents);
  const compareLabel =
    options.length === 2 ? `Compare ${options[0].name} and ${options[1].name}` : "Compare plans";

  return (
    <StateLayout
      flowLabel={`AI / ${tierName} usage limit`}
      flowIcon="sparkles"
      flowTone="ai"
      title="You've reached your AI limit"
      description={`You're on ${tierName}${currentIsFree ? ", the free app plan" : ""}. AI requests are currently limited, but your manual tracking remains available.`}
      footnote="No upgrade or purchase has been made."
      onBack={onBack}
      showBrand
      actions={[
        { label: compareLabel, onPress: onUpgrade },
        { label: "Keep tracking manually", variant: "secondary", onPress: onKeepTracking },
      ]}
    >
      <InfoCard
        tone="ai"
        title={`${tierName}${currentIsFree ? " · Free" : ""}`}
        body={
          resets
            ? `Your current AI allowance is used. It resets ${resets}.`
            : "Your current AI allowance is used. We couldn't load the reset time right now."
        }
      />
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: 10,
        }}
      >
        <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14 }}>Explore app plans</Text>
        {options.map((p) => (
          <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>{p.name}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{monthlyLabel(p)}</Text>
          </View>
        ))}
        <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>
          Review each plan's current AI access and terms before choosing. This screen does not promise unlimited AI.
        </Text>
      </View>
      <InfoCard
        tone="accent"
        title="Programs are separate purchases"
        body="Every program is individually paid, not included as a subscription entitlement. Professional coaching also requires its own accepted quote and payment."
      />
      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
        You can still enter meals, workouts and recovery logs manually on {tierName}.
      </Text>
    </StateLayout>
  );
}
