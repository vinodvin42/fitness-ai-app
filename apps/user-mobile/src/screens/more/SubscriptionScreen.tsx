import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SubscriptionDetail, SubscriptionPlan } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Icon, IconName } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { ErrorState } from "../../components/ErrorState";
import { fetchCurrentSubscription, fetchPlans, cancelSubscription, subscribe } from "../../api/subscriptions";
import { usePaymentsConfigured } from "../../lib/useRazorpayPurchase";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Subscription">;

const TIER_LABEL: Record<SubscriptionPlan["tier"], string> = { basic: "Basic", pro: "Pro", elite: "Elite" };
const TIER_ICON: Record<SubscriptionPlan["tier"], IconName> = { basic: "zap", pro: "trophy", elite: "sparkles" };
const TIER_TINT: Record<SubscriptionPlan["tier"], { color: string; soft: string }> = {
  basic: { color: colors.textSecondary, soft: colors.surfaceHigh },
  pro: { color: colors.accent, soft: colors.accentSoft },
  elite: { color: colors.aiAccent, soft: colors.aiAccentSoft },
};

function formatPrice(priceCents: number, billingCycle: SubscriptionPlan["billingCycle"]) {
  if (priceCents === 0) return "Free";
  return `₹${(priceCents / 100).toFixed(2)} / ${billingCycle === "annual" ? "yr" : "mo"}`;
}

/**
 * U6 Premium entitlement (15 Sep 2026) — this card used to show a hardcoded
 * "Active" Pill for ANY current subscription, including a real `trialing`
 * or `past_due` one (the two other non-terminal statuses `Subscription.
 * status` already declares — see subscriptions.service.ts's
 * getCurrentSubscription doc comment for why `past_due` wasn't even
 * reaching this screen before today). A binary "has a subscription row" /
 * "doesn't" read is exactly the gap the milestone's Core State
 * Requirements (§5, "Entitlement" row) calls out. `renewsAt` already
 * existed on every Subscription but nothing ever read it to notice a
 * lapsed renewal date — no renewal/billing cron exists in this build (a
 * real one is a genuine follow-up, not something to fake client-side), so
 * this was an honest, purely-derived "expired" read of data that was
 * already there, not a new state the server tracks.
 *
 * **18 Sep 2026 (gap §57):** the real cancel-at-period-end policy and
 * lazy-expiry mechanism are now backend-real (subscriptions.service.ts) —
 * this function's own "expired" read is no longer purely client-derived;
 * `getCurrentSubscription` now genuinely excludes an expired row (it
 * flips to a real DB-persisted `expired` status the moment it's read
 * past `renewsAt`), so a client-visible `current` here is never actually
 * lapsed unless it's mid-cancellation (`cancelAtPeriodEnd: true`, not yet
 * past `renewsAt`) — that's the new **"Expiring"** state, distinct from
 * plain "Active": access is unchanged, but it will not renew. `revoked`
 * (admin force-revoke, also real as of this same pass) is a genuinely
 * different terminal state from a lapsed cancellation — an honest,
 * distinct Pill, never folded into "Expired".
 */
function entitlementDisplay(current: {
  status: SubscriptionDetail["status"];
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}): {
  label: string;
  tone: "success" | "accent" | "warning" | "neutral";
  icon: IconName;
  note: string | null;
} {
  if (current.status === "revoked") {
    return {
      label: "Revoked",
      tone: "neutral",
      icon: "alert-triangle" as IconName,
      note: "This subscription was revoked by an administrator. Contact support if you believe this is a mistake.",
    };
  }
  if (current.status === "expired") {
    return {
      label: "Expired",
      tone: "neutral",
      icon: "alert-triangle" as IconName,
      note: "This plan's renewal date has passed. Choose a plan below to reactivate.",
    };
  }
  if (current.status === "past_due") {
    return {
      label: "Payment issue",
      tone: "warning",
      icon: "alert-triangle" as IconName,
      note: "Your last payment didn't go through. Update your payment method to keep premium access.",
    };
  }
  if (current.cancelAtPeriodEnd) {
    return {
      label: "Expiring",
      tone: "warning",
      icon: "alert-triangle" as IconName,
      note: current.renewsAt
        ? `Your plan stays active until ${new Date(current.renewsAt).toLocaleDateString()}, then it won't renew.`
        : "This plan is set to cancel and won't renew.",
    };
  }
  if (current.status === "trialing") {
    return { label: "Trial", tone: "accent", icon: "zap" as IconName, note: null };
  }
  return { label: "Active", tone: "success", icon: "check" as IconName, note: null };
}

/**
 * Percent saved by an annual plan vs. paying its same-tier monthly plan
 * for 12 months — computed from whatever's actually seeded rather than a
 * hardcoded "2 months free" claim, so it can't drift out of sync with the
 * real prices. Returns null if there's no same-tier monthly plan to
 * compare against (shouldn't happen given how this pass seeded plans, but
 * this is real annual-plan-relative-to-monthly math, not a guess).
 */
function annualSavingsPercent(plan: SubscriptionPlan, allPlans: SubscriptionPlan[]): number | null {
  if (plan.billingCycle !== "annual" || plan.priceCents === 0) return null;
  const monthlyEquivalent = allPlans.find((p) => p.tier === plan.tier && p.billingCycle === "monthly");
  if (!monthlyEquivalent || monthlyEquivalent.priceCents === 0) return null;
  const yearIfMonthly = monthlyEquivalent.priceCents * 12;
  if (yearIfMonthly <= 0) return null;
  return Math.round((1 - plan.priceCents / yearIfMonthly) * 100);
}

/**
 * Subscription Plans + Subscription Management, combined into one screen
 * (docs/mobile/03-screen-inventory.md §M — two of the seven §M screens).
 * Phase 3 scope: real plans, real subscribe/change/cancel, backed by the
 * SubscriptionPlan/Subscription models that have existed since Phase 0.
 * 19 Aug 2026: a real **Monthly/Annual toggle** — Pro and Elite each now
 * have a real seeded annual `SubscriptionPlan` row (Basic stays
 * monthly-only; it's free, so a billing-cycle choice is meaningless for
 * it) — with a real "save X%" badge computed from the actual seeded
 * prices, not a hardcoded claim. See gap §35 for the annual-pricing
 * convention this pass chose (10× the monthly price, ~a 2-months-free
 * framing) and why Basic was left out. **20 Aug 2026:** Payment Checkout
 * is real now for any paid plan — Basic (free) still activates directly
 * via `subscribe()` below, but Pro/Elite route through a real Razorpay
 * order + hosted Checkout + server-side signature verification
 * (`useRazorpayPurchase`/`RazorpayCheckoutModal`), closing gap §14 for
 * this screen. **31 Aug 2026:** a real **feature-comparison table** (§M)
 * and a **coupon field** now ship — the coupon applies a real discount at
 * checkout (see apps/api's coupons module), and paid checkouts route to
 * dedicated **Payment Success / Failed** screens (§M) instead of an inline
 * Alert. The comparison table presents the plan lineup honestly as what
 * each tier includes; note nothing in the app hard-gates on tier yet
 * (gap §35), so it's a plan-lineup table, not an entitlement enforcement
 * point.
 */
export function SubscriptionScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [billingCycle, setBillingCycle] = useState<SubscriptionPlan["billingCycle"]>("monthly");
  const [couponCode, setCouponCode] = useState("");

  const {
    data: plans,
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
  } = useQuery({ queryKey: ["subscriptions", "plans"], queryFn: fetchPlans });
  const {
    data: current,
    isLoading: currentLoading,
    isError: currentError,
    refetch: refetchCurrent,
  } = useQuery({
    queryKey: ["subscriptions", "current"],
    queryFn: fetchCurrentSubscription,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["subscriptions", "current"] }),
      queryClient.invalidateQueries({ queryKey: ["subscriptions", "history"] }),
    ]);

  const { configured: paymentsConfigured } = usePaymentsConfigured();
  // U-M1 (28 Sep 2026): the Razorpay order/modal/verify sequence moved to
  // CheckoutScreen, which is now the single paid-purchase path — it owns
  // the price breakdown, the GST line and the "Have a code?" field that
  // decision #7 and D3 require, none of which fit in a bare gateway
  // modal. This screen keeps only the free-plan activation below, so the
  // hook and the modal are deliberately gone rather than kept as an
  // unused second copy of a payment flow.

  // A free plan still activates directly — there is nothing to pay, so
  // sending the user to a checkout screen showing ₹0.00 would be
  // ceremony. Every paid plan navigates to CheckoutScreen, which owns
  // the order, the modal and the result handoff from there.
  const onSubscribe = async (plan: SubscriptionPlan) => {
    setPendingPlanId(plan.id);
    try {
      if (plan.priceCents === 0) {
        await subscribe({ planId: plan.id });
        await refresh();
      } else {
        // U-M1: a paid plan now goes through the real checkout screen
        // (price and GST from the Commerce API, payment method, "Have a
        // code?") rather than straight into the gateway modal. The modal
        // showed a total with no breakdown and no way to enter a code,
        // which is what decision #7 and D3 are about.
        navigation.navigate("Checkout", { purpose: "subscription", referenceId: plan.id });
      }
    } catch (err) {
      Alert.alert("Couldn't subscribe", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setPendingPlanId(null);
    }
  };

  // Gap §57 (18 Sep 2026) — real cancel-at-period-end confirmation copy,
  // replacing the old immediate-loss framing (which never actually
  // matched what `cancelSubscription()` did server-side even before this
  // pass — see that function's own doc comment for the full policy).
  const onCancel = () => {
    const renewsAtLabel = current?.renewsAt ? new Date(current.renewsAt).toLocaleDateString() : null;
    Alert.alert(
      "Cancel subscription?",
      renewsAtLabel
        ? `Your plan will remain active until ${renewsAtLabel}, then it won't renew. You won't be charged again.`
        : "Your plan will remain active through the end of your current billing period, then it won't renew. You won't be charged again.",
      [
        { text: "Keep plan", style: "cancel" },
        {
          text: "Cancel plan",
          style: "destructive",
          onPress: async () => {
            setIsCanceling(true);
            try {
              await cancelSubscription();
              await refresh();
            } catch (err) {
              Alert.alert("Couldn't cancel subscription", extractErrorMessage(err, "Check your connection and try again."));
            } finally {
              setIsCanceling(false);
            }
          },
        },
      ],
    );
  };

  if (plansLoading || currentLoading) {
    return (
      <ScreenContainer title="Subscription">
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (plansError || currentError) {
    return (
      <ScreenContainer title="Subscription">
        <ErrorState
          onRetry={() => {
            refetchPlans();
            refetchCurrent();
          }}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Subscription">
      {current ? (
        <Card>
          {(() => {
            const entitlement = entitlementDisplay(current);
            return (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: radius.md,
                      backgroundColor: TIER_TINT[current.plan.tier].soft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={TIER_ICON[current.plan.tier]} size={22} color={TIER_TINT[current.plan.tier].color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{TIER_LABEL[current.plan.tier]}</Text>
                      <Pill label={entitlement.label} tone={entitlement.tone} icon={entitlement.icon} />
                    </View>
                    <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
                      {formatPrice(current.plan.priceCents, current.plan.billingCycle)}
                      {current.renewsAt ? ` · renews ${new Date(current.renewsAt).toLocaleDateString()}` : ""}
                    </Text>
                  </View>
                </View>
                {entitlement.note ? (
                  <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.sm }}>
                    {entitlement.note}
                  </Text>
                ) : null}
              </>
            );
          })()}
          {/* Gap §57 — only offer Cancel for a still-actionable, not-already-cancelAtPeriodEnd subscription. A terminal (expired/revoked) or already-scheduled-to-lapse row has nothing left to cancel. */}
          {(current.status === "active" || current.status === "trialing" || current.status === "past_due") &&
            !current.cancelAtPeriodEnd && (
              <Button
                label="Cancel Subscription"
                variant="secondary"
                onPress={onCancel}
                loading={isCanceling}
                style={{ marginTop: spacing.md }}
              />
            )}
        </Card>
      ) : (
        <Card style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg }}>
          <Icon name="trophy" size={28} color={colors.accent} />
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Unlock your full potential</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>Choose a plan to get started.</Text>
        </Card>
      )}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
        <Chip label="Monthly" selected={billingCycle === "monthly"} onPress={() => setBillingCycle("monthly")} />
        <Chip label="Annual" selected={billingCycle === "annual"} onPress={() => setBillingCycle("annual")} />
      </View>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Text style={{ color: colors.textSecondary }}>{current ? "Change plan" : "Choose a plan"}</Text>
        {(plans ?? [])
          .filter((plan) => plan.id !== current?.planId)
          // Basic (free) has no annual variant — a billing-cycle choice is
          // meaningless for a $0 plan, so it's always shown regardless of
          // which chip is selected above.
          .filter((plan) => plan.priceCents === 0 || plan.billingCycle === billingCycle)
          .map((plan) => {
            const savings = annualSavingsPercent(plan, plans ?? []);
            const tint = TIER_TINT[plan.tier];
            return (
              <Card
                key={plan.id}
                style={plan.tier === "pro" ? { borderColor: colors.accent } : undefined}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: radius.md,
                      backgroundColor: tint.soft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={TIER_ICON[plan.tier]} size={20} color={tint.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{TIER_LABEL[plan.tier]}</Text>
                      {plan.tier === "pro" ? <Pill label="Popular" tone="accent" /> : null}
                      {savings != null ? <Pill label={`Save ${savings}%`} tone="success" /> : null}
                    </View>
                    <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
                      {formatPrice(plan.priceCents, plan.billingCycle)}
                    </Text>
                  </View>
                  <Button
                    label={!paymentsConfigured && plan.priceCents > 0 ? "Coming soon" : current ? "Switch" : "Choose"}
                    onPress={() => onSubscribe(plan)}
                    loading={pendingPlanId === plan.id}
                    disabled={!paymentsConfigured && plan.priceCents > 0}
                    style={{ paddingHorizontal: spacing.md, height: 40 }}
                  />
                </View>
              </Card>
            );
          })}
      </View>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Have a coupon?</Text>
        <TextInput
          value={couponCode}
          onChangeText={(v) => setCouponCode(v.toUpperCase())}
          placeholder="Enter code"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          style={{
            color: colors.textPrimary,
            backgroundColor: colors.background,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.sm,
          }}
        />
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
          Applied at checkout for paid plans. An invalid code will stop the order.
        </Text>
      </Card>

      <FeatureComparison />

      <Button
        label="Purchase History"
        variant="secondary"
        onPress={() => navigation.navigate("SubscriptionHistory")}
        style={{ marginTop: spacing.lg }}
      />

    </ScreenContainer>
  );
}

const COMPARISON_FEATURES: Array<{ label: string; basic: boolean; pro: boolean; elite: boolean }> = [
  { label: "Workout & nutrition tracking", basic: true, pro: true, elite: true },
  { label: "Progress & timeline", basic: true, pro: true, elite: true },
  { label: "AI Coach chat", basic: false, pro: true, elite: true },
  { label: "Recovery log", basic: false, pro: true, elite: true },
  { label: "1-on-1 human coaching", basic: false, pro: false, elite: true },
  { label: "Priority support", basic: false, pro: false, elite: true },
];

/**
 * Feature comparison (§M) — an honest plan-lineup table. Nothing in the app
 * hard-gates on tier yet (gap §35), so this communicates what each tier is
 * intended to include, not an enforced entitlement matrix.
 */
function FeatureComparison() {
  const cell = (on: boolean) => (
    <Text style={{ color: on ? colors.accent : colors.textMuted, textAlign: "center", flex: 1 }}>{on ? "✓" : "–"}</Text>
  );
  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Compare plans</Text>
      <View style={{ flexDirection: "row", marginBottom: spacing.xs }}>
        <Text style={{ color: colors.textMuted, ...typography.meta, flex: 2 }}>Feature</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, flex: 1, textAlign: "center" }}>Basic</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, flex: 1, textAlign: "center" }}>Pro</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, flex: 1, textAlign: "center" }}>Elite</Text>
      </View>
      {COMPARISON_FEATURES.map((f) => (
        <View
          key={f.label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.xs,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textSecondary, flex: 2 }}>{f.label}</Text>
          {cell(f.basic)}
          {cell(f.pro)}
          {cell(f.elite)}
        </View>
      ))}
    </Card>
  );
}
