import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
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
import { fetchCurrentSubscription, fetchPlans, subscribe } from "../../api/subscriptions";
import { usePaymentsConfigured } from "../../lib/useRazorpayPurchase";
import { extractErrorMessage } from "../../lib/apiError";
import { COMPARISON_FEATURES, TIER_ORDER, comparisonColumns, featuresFor, hasLaunchOffer, isFreePlan } from "../../lib/planLineup";
import { formatRupees } from "../../lib/money";
import { colors, fonts, radius, spacing, typography, themed } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Subscription">;

const TIER_ICON: Record<SubscriptionPlan["tier"], IconName> = { basic: "zap", grow: "trophy", prime: "sparkles" };
const TIER_TINT: Record<SubscriptionPlan["tier"], { color: string; soft: string }> = themed(() => ({
  basic: { color: colors.textSecondary, soft: colors.surfaceHigh },
  grow: { color: colors.accentText, soft: colors.accentSoft },
  prime: { color: colors.aiText, soft: colors.aiAccentSoft },
}));

function formatPrice(priceCents: number, billingCycle: SubscriptionPlan["billingCycle"]) {
  if (priceCents === 0) return "Free";
  // Plan prices already include GST (D3) — said here so the checkout total is no surprise.
  return `${formatRupees(priceCents)} / ${billingCycle === "annual" ? "yr" : billingCycle === "quarterly" ? "3 mo" : "mo"} incl. GST`;
}

/** D8: e.g. "₹349 / mo incl. GST from 1 Dec 2026" when a new price is scheduled. */
function formatUpcoming(plan: SubscriptionPlan): string | null {
  if (!plan.upcomingPrice) return null;
  const date = new Date(plan.upcomingPrice.effectiveFrom).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  return `${formatPrice(plan.upcomingPrice.priceCents, plan.billingCycle)} from ${date}`;
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
  displayState?: SubscriptionDetail["displayState"];
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
      note: "This plan has ended. Renew it, or choose another plan below.",
    };
  }
  if (current.status === "past_due") {
    return {
      label: "Payment issue",
      tone: "warning",
      icon: "alert-triangle" as IconName,
      note: "Your last payment didn't go through. Renew to pay again and keep your plan.",
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
  if (current.status === "suspended") {
    return {
      label: "Suspended",
      tone: "warning",
      icon: "alert-triangle" as IconName,
      note: "This plan is paused by Fynrox. Contact support for details.",
    };
  }
  if (current.status === "pending") {
    return { label: "Pending", tone: "accent", icon: "clock" as IconName, note: "We're confirming this plan. Check back in a few minutes." };
  }
  // 20 Oct 2026: no autopay, so a paid plan ends unless renewed.
  if (current.displayState === "expiring") {
    return {
      label: "Ending soon",
      tone: "warning",
      icon: "alert-triangle" as IconName,
      note: current.renewsAt
        ? `Your plan is paid until ${new Date(current.renewsAt).toLocaleDateString()}. Renew to keep it.`
        : "Your plan ends soon. Renew to keep it.",
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
 *
 * **20 Oct 2026 (owner):** plans, prices and discounts are owned by the
 * super admin portal: this screen lists exactly the plans on sale there, and
 * the comparison has a column for each tier on sale (lib/planLineup.ts).
 * Basic shows no renewal date and no Cancel. A plan shows "Launch offer"
 * while a higher price is scheduled for it. A code typed here is carried to
 * Checkout.
 *
 * **24 Oct 2026 (owner: "not so clear and easy how subscription works"):**
 * redesigned around three questions. "Your plan": what you pay, until when,
 * and that nothing renews automatically. "Plans": one card per tier for the
 * chosen period (price, GST, per-month cost, what it adds over the tier
 * below, one clear button, your own plan marked). "How it works": the real
 * billing rules in plain words.
 */
export function SubscriptionScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<SubscriptionPlan["billingCycle"]>(route.params?.billingCycle ?? "monthly");
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
        navigation.navigate("Checkout", { purpose: "subscription", referenceId: plan.id, code: couponCode.trim() || undefined });
      }
    } catch (err) {
      Alert.alert("Couldn't subscribe", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setPendingPlanId(null);
    }
  };

  // 20 Oct 2026: the free plan, as named in admin, and whether a paid plan is running.
  const freePlan = (plans ?? []).find((p) => isFreePlan(p) && p.billingCycle === "monthly") ?? (plans ?? []).find(isFreePlan);
  const paidPlanRunning =
    !!current && !isFreePlan(current.plan) && (current.status === "active" || current.status === "trialing" || current.status === "past_due");

  if (plansLoading || currentLoading) {
    return (
      <ScreenContainer title={t("subscription.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (plansError || currentError) {
    return (
      <ScreenContainer title={t("subscription.title")}>
        <ErrorState
          onRetry={() => {
            refetchPlans();
            refetchCurrent();
          }}
        />
      </ScreenContainer>
    );
  }

  // 24 Oct 2026 (owner: "not so clear and easy how subscription works"): one plan card per tier for
  // the chosen period, the member's own plan marked on it, and a plain "How it works".
  const periods = (["monthly", "quarterly", "annual"] as const).filter(
    (c) => c === "monthly" || (plans ?? []).some((p) => p.priceCents > 0 && p.billingCycle === c),
  );
  const tierCards = TIER_ORDER.flatMap((tier) => {
    const inTier = (plans ?? []).filter((p) => p.tier === tier);
    const plan = inTier.find((p) => p.priceCents === 0) ?? inTier.find((p) => p.billingCycle === billingCycle);
    return plan ? [plan] : [];
  });
  const liveCurrent = !!current && (current.status === "active" || current.status === "trialing" || current.status === "past_due");

  return (
    <ScreenContainer title={t("subscription.title")} subtitle="Plans and billing">
      {current || freePlan ? (
        <CurrentPlanCard
          current={current ?? null}
          freePlan={freePlan ?? null}
          // The scheduled price lives on the plan as sold (the subscription carries the price paid).
          upcoming={current ? formatUpcomingFor((plans ?? []).find((p) => p.id === current.plan.id)) : null}
          canRenew={
            !!current &&
            paymentsConfigured &&
            !isFreePlan(current.plan) &&
            (plans ?? []).some((p) => p.id === current.plan.id) &&
            (current.displayState === "expiring" || current.status === "expired" || current.status === "past_due")
          }
          canCancel={
            !!current &&
            !isFreePlan(current.plan) &&
            (current.status === "active" || current.status === "trialing" || current.status === "past_due") &&
            !current.cancelAtPeriodEnd
          }
          onRenew={() =>
            current &&
            navigation.navigate("Checkout", { purpose: "subscription", referenceId: current.plan.id, code: couponCode.trim() || undefined })
          }
          // Figma payments/07 (24 Oct 2026): a screen that says what changes and asks why.
          onCancel={() => navigation.navigate("CancelSubscription")}
          cancelLabel={t("subscription.cancel")}
        />
      ) : (
        <Card style={{ alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg }}>
          <Icon name="trophy" size={28} color={colors.accent} />
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("subscription.unlock")}</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>{t("subscription.choosePlan")}</Text>
        </Card>
      )}

      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.lg }}>Plans</Text>
      {periods.length > 1 ? (
        <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          {/* Only billing periods that have a paid plan on sale (3-month and yearly prices may not be set yet). */}
          {periods.map((c) => (
            <Chip
              key={c}
              label={c === "monthly" ? t("subscription.monthly") : c === "quarterly" ? t("subscription.quarterly") : t("subscription.annual")}
              selected={billingCycle === c}
              onPress={() => setBillingCycle(c)}
            />
          ))}
        </View>
      ) : null}
      {/* Paid plans are still shown with their prices, but without a dead button: one plain line says why. */}
      {!paymentsConfigured ? (
        <Text style={{ color: colors.warningText, ...typography.meta, marginTop: spacing.sm }}>{t("checkout.paymentsUnavailable")}</Text>
      ) : null}
      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        {tierCards
          .map((plan, i) => {
            const isFree = isFreePlan(plan);
            const isCurrent = isFree ? !current || (liveCurrent && isFreePlan(current.plan)) : liveCurrent && current?.planId === plan.id;
            const lower = i > 0 ? tierCards[i - 1] : null;
            let cta: { label: string; disabled: boolean } | null;
            if (isCurrent) cta = { label: "Your current plan", disabled: true };
            else if (isFree) cta = paidPlanRunning ? { label: `Yours when ${current?.plan.name ?? "your plan"} ends`, disabled: true } : { label: `Switch to ${plan.name}`, disabled: false };
            else if (!paymentsConfigured) cta = null;
            else cta = { label: paidPlanRunning ? "Switch to this plan" : `Get ${plan.name}`, disabled: false };
            return { plan, isCurrent, cta, lower, highlight: !isFree && i === tierCards.length - 1 };
          })
          // The member's own plan is already summed up above, so the other plans come first.
          .sort((a, b) => Number(a.isCurrent) - Number(b.isCurrent))
          .map(({ plan, isCurrent, cta, lower, highlight }) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              savingsPercent={annualSavingsPercent(plan, plans ?? [])}
              highlight={highlight}
              isCurrent={isCurrent}
              includes={lower ? lower.name : null}
              features={featuresFor(plan.tier, lower ? lower.tier : null)}
              cta={cta}
              loading={pendingPlanId === plan.id}
              onPress={() => onSubscribe(plan)}
            />
          ))}
      </View>

      <HowItWorks paidName={tierCards.find((p) => !isFreePlan(p))?.name ?? "a paid plan"} freeName={freePlan?.name ?? "the free plan"} />

      <CouponField value={couponCode} onChange={setCouponCode} />

      <FeatureComparison plans={plans ?? []} />

      <Button
        label={t("subscription.purchaseHistory")}
        variant="secondary"
        onPress={() => navigation.navigate("Purchases")}
        style={{ marginTop: spacing.lg }}
      />
    </ScreenContainer>
  );
}

const formatUpcomingFor = (plan: SubscriptionPlan | undefined) => (plan ? formatUpcoming(plan) : null);

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** "₹299" and "/ month" for the big price line. */
function priceParts(plan: SubscriptionPlan): { amount: string; per: string } {
  if (plan.priceCents === 0) return { amount: "Free", per: "" };
  const per = plan.billingCycle === "annual" ? "/ year" : plan.billingCycle === "quarterly" ? "/ 3 months" : "/ month";
  return { amount: formatRupees(plan.priceCents), per };
}

/** "₹100 a month" for a 3-month or yearly plan; null for monthly. */
function perMonth(plan: SubscriptionPlan): string | null {
  const months = plan.billingCycle === "annual" ? 12 : plan.billingCycle === "quarterly" ? 3 : 0;
  if (!months || plan.priceCents === 0) return null;
  return `${formatRupees(Math.round(plan.priceCents / months / 100) * 100)} a month`;
}

function FactRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: spacing.md,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text style={{ flex: 1, textAlign: "right", color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

/**
 * The member's own plan at the top: what they pay, until when, and what
 * happens next. No autopay in this build (20 Oct 2026), so a paid plan says
 * plainly that nothing is charged automatically.
 */
function CurrentPlanCard({
  current,
  freePlan,
  upcoming,
  canRenew,
  canCancel,
  onRenew,
  onCancel,
  cancelLabel,
}: {
  current: SubscriptionDetail | null;
  freePlan: SubscriptionPlan | null;
  upcoming: string | null;
  canRenew: boolean;
  canCancel: boolean;
  onRenew: () => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  const { colors: theme } = useTheme();
  const plan = current?.plan ?? freePlan;
  if (!plan) return null;
  const free = isFreePlan(plan);
  const entitlement = current ? entitlementDisplay(current) : { label: "Active", tone: "success" as const, icon: "check" as IconName, note: null };
  const ended = current?.status === "expired" || current?.status === "revoked";
  const facts: Array<{ label: string; value: string }> = [];
  if (free) {
    facts.push({ label: "Price", value: "Free" });
    facts.push({ label: "Ends", value: "Never" });
  } else if (current) {
    facts.push({ label: "You pay", value: formatPrice(current.priceCents ?? current.plan.priceCents, current.plan.billingCycle) });
    if (current.renewsAt && !ended) {
      facts.push({ label: current.cancelAtPeriodEnd ? "Ends on" : "Paid until", value: longDate(current.renewsAt) });
    }
    if (!ended && !current.cancelAtPeriodEnd) facts.push({ label: "Auto-renew", value: "Off, you renew it yourself" });
    if (upcoming && !ended) facts.push({ label: "Next renewal price", value: upcoming });
  }
  const tint = TIER_TINT[plan.tier];
  return (
    <Card style={{ gap: spacing.sm, borderColor: free ? colors.border : theme.accent }}>
      <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1 }}>YOUR PLAN</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: tint.soft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={TIER_ICON[plan.tier]} size={20} color={tint.color} />
        </View>
        <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h1, fontSize: 24 }}>{plan.name}</Text>
        <Pill label={entitlement.label} tone={entitlement.tone} icon={entitlement.icon} />
      </View>
      <View>
        {facts.map((f, i) => (
          <FactRow key={f.label} label={f.label} value={f.value} last={i === facts.length - 1} />
        ))}
      </View>
      {entitlement.note ? <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 18 }}>{entitlement.note}</Text> : null}
      {canRenew ? <Button label={`Renew ${plan.name}`} onPress={onRenew} /> : null}
      {canCancel ? (
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "center", paddingVertical: 4 }}>
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{cancelLabel}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

function PlanCard({
  plan,
  savingsPercent,
  highlight,
  isCurrent,
  includes,
  features,
  cta,
  loading,
  onPress,
}: {
  plan: SubscriptionPlan;
  savingsPercent: number | null;
  highlight: boolean;
  isCurrent: boolean;
  includes: string | null;
  features: string[];
  cta: { label: string; disabled: boolean } | null;
  loading: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors: theme } = useTheme();
  const { amount, per } = priceParts(plan);
  const monthly = perMonth(plan);
  const upcoming = hasLaunchOffer(plan) ? formatUpcoming(plan) : null;
  const tint = TIER_TINT[plan.tier];
  return (
    <Card style={{ gap: spacing.sm, borderWidth: highlight ? 2 : 1, borderColor: highlight ? theme.accent : colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: radius.md, backgroundColor: tint.soft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={TIER_ICON[plan.tier]} size={18} color={tint.color} />
        </View>
        <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h2 }}>{plan.name}</Text>
        {isCurrent ? <Pill label="Current" tone="success" icon="check" /> : highlight ? <Pill label="Most features" tone="accent" /> : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 34 }}>{amount}</Text>
        {per ? <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 4 }}>{per}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {plan.priceCents === 0 ? "Never ends · no card needed" : ["incl. GST", monthly].filter(Boolean).join(" · ")}
        </Text>
        {savingsPercent != null ? <Pill label={t("subscription.save", { percent: savingsPercent })} tone="success" /> : null}
      </View>
      {upcoming ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <Pill label={t("subscription.launchOffer")} tone="accent" />
          <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>then {upcoming}</Text>
        </View>
      ) : null}

      <View style={{ gap: 8, paddingTop: spacing.xs }}>
        {includes ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Icon name="check-check" size={16} color={theme.accentText} />
            <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>Everything in {includes}</Text>
          </View>
        ) : null}
        {features.map((k) => (
          <View key={k} style={{ flexDirection: "row", gap: spacing.sm }}>
            <Icon name="check" size={16} color={colors.successText} strokeWidth={3} />
            <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 14 }}>{t(`subscription.features.${k}`)}</Text>
          </View>
        ))}
      </View>

      {cta ? (
        <Button
          label={cta.label}
          variant={cta.disabled || !highlight ? "secondary" : "primary"}
          onPress={onPress}
          disabled={cta.disabled}
          loading={loading}
          style={{ marginTop: spacing.xs }}
        />
      ) : null}
    </Card>
  );
}

/**
 * How it works, in plain words and only what the app really does: pay per
 * period (UPI, card or netbanking; no autopay), renewing early adds a full
 * period after the current end date, cancelling keeps what was paid for,
 * the free plan never ends, and coaching and programmes are paid separately.
 */
function HowItWorks({ paidName, freeName }: { paidName: string; freeName: string }) {
  const { colors: theme } = useTheme();
  const rows: Array<{ icon: IconName; title: string; body: string }> = [
    { icon: "smartphone", title: "Pay for one period at a time", body: "Pay by UPI, card or netbanking. Nothing is charged automatically." },
    { icon: "refresh-cw", title: "Renew when you like", body: "Renewing early adds a full period after your current end date, so you never lose days." },
    { icon: "circle-x", title: "Cancel any time", body: `You keep ${paidName} until the end of what you paid for, then you're on ${freeName}.` },
    { icon: "shield-check", title: `${freeName} is free forever`, body: "No card needed, and it never ends." },
    { icon: "users", title: "Coaching and programmes are separate", body: "Coach sessions and programmes are paid for on their own, on any plan." },
  ];
  return (
    <Card style={{ marginTop: spacing.lg, gap: spacing.md }}>
      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>How it works</Text>
      {rows.map((r) => (
        <View key={r.title} style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name={r.icon} size={16} color={theme.accentText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{r.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{r.body}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

/** "Have a coupon?" folded away until tapped; the code is carried to Checkout. */
function CouponField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { colors: theme } = useTheme();
  const [open, setOpen] = useState(value.length > 0);
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" hitSlop={8} style={{ marginTop: spacing.md, alignSelf: "flex-start" }}>
        <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>{t("subscription.haveCoupon")}</Text>
      </Pressable>
    );
  }
  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>{t("subscription.haveCoupon")}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.toUpperCase())}
        placeholder={t("subscription.enterCode")}
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
      <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>{t("subscription.couponNote")}</Text>
    </Card>
  );
}

/**
 * Feature comparison (§M) — an honest plan-lineup table. Nothing in the app
 * hard-gates on tier yet (gap §35), so this communicates what each tier is
 * intended to include, not an enforced entitlement matrix. One column per
 * tier on sale, headed with the plan name the super admin gave it.
 */
function FeatureComparison({ plans }: { plans: SubscriptionPlan[] }) {
  const { t } = useTranslation();
  const columns = comparisonColumns(plans);
  if (columns.length === 0) return null;
  const cell = (on: boolean) => (
    <Text style={{ color: on ? colors.accent : colors.textMuted, textAlign: "center", flex: 1 }}>{on ? "✓" : "–"}</Text>
  );
  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>{t("subscription.comparePlans")}</Text>
      <View style={{ flexDirection: "row", marginBottom: spacing.xs }}>
        <Text style={{ color: colors.textMuted, ...typography.meta, flex: 2 }}>{t("subscription.feature")}</Text>
        {columns.map((c) => (
          <Text key={c.tier} style={{ color: colors.textMuted, ...typography.meta, flex: 1, textAlign: "center" }}>
            {c.name}
          </Text>
        ))}
      </View>
      {COMPARISON_FEATURES.map((f) => (
        <View
          key={f.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.xs,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textSecondary, flex: 2 }}>{t(`subscription.features.${f.key}`)}</Text>
          {columns.map((c) => (
            <React.Fragment key={c.tier}>{cell(f[c.tier])}</React.Fragment>
          ))}
        </View>
      ))}
    </Card>
  );
}
