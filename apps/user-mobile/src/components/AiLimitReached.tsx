import React from "react";
import { Text } from "react-native";
import type { AiCoachUsage } from "@fitness-ai-app/types";
import { InfoCard, StateLayout } from "./StatePanels";
import { colors, spacing, typography } from "../theme/tokens";

const TIER_LABEL: Record<AiCoachUsage["tier"], string> = { basic: "Basic", pro: "Pro", elite: "Elite" };

interface AiLimitReachedProps {
  usage: AiCoachUsage | undefined;
  onUpgrade: () => void;
  onKeepTracking: () => void;
  onBack: () => void;
}

/**
 * Figma AI 03 - plan limit reached. Unlike the design (which had no confirmed
 * numbers), the count and reset time here come from GET /ai-coach/usage. When
 * usage couldn't be loaded the numbers are simply omitted. Prices are not
 * hard-coded: the Subscription screen shows the live plans.
 */
export function AiLimitReached({ usage, onUpgrade, onKeepTracking, onBack }: AiLimitReachedProps) {
  const tier = usage ? TIER_LABEL[usage.tier] : null;
  const resets = usage
    ? new Date(usage.resetsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <StateLayout
      flowLabel="AI / Plan usage limit"
      flowIcon="sparkles"
      flowTone="ai"
      title="You've reached your AI limit"
      description={`${tier ? `You're on the ${tier} plan. ` : ""}AI requests are limited, but your manual tracking remains available.`}
      footnote="No upgrade or purchase has been made."
      onBack={onBack}
      actions={[
        { label: "Compare plans", onPress: onUpgrade },
        { label: "Keep tracking manually", variant: "secondary", onPress: onKeepTracking },
      ]}
    >
      <InfoCard
        tone="ai"
        title={usage && tier ? `${tier}: ${usage.used} of ${usage.limit} requests used` : "Allowance used"}
        body={
          usage && resets
            ? `Your allowance resets ${resets}. Your unsent message is kept.`
            : "Your current AI allowance is used. We couldn't load the reset time right now."
        }
      />
      <InfoCard
        title="Explore app plans"
        body="Compare current plans and their AI access in Subscription. Review each plan's terms before choosing; no plan is promised to be unlimited."
      />
      <InfoCard
        tone="accent"
        title="Programs are separate purchases"
        body="Every program is individually paid, not included as a subscription entitlement. Professional coaching also requires its own accepted quote and payment."
      />
      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
        You can still enter meals, workouts and recovery logs manually.
      </Text>
    </StateLayout>
  );
}
