import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SubscriptionDetail } from "@fitness-ai-app/types";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { FynroxProgramsSection } from "../../components/FynroxProgramsSection";
import { Pill } from "../../components/Pill";
import { useAuth } from "../../context/AuthContext";
import { cancelSubscription, fetchCurrentSubscription, fetchPlans } from "../../api/subscriptions";
import { extractErrorMessage } from "../../lib/apiError";
import { formatRupees } from "../../lib/money";
import { isFreePlan } from "../../lib/planLineup";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { RecoverShell } from "../recover/parts";
import { periodProgress } from "./ProfileScreen";
import { OutlineButton, RowGroup, SettingRow, TextAction } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "MyPlan">;

const STATUS: Record<SubscriptionDetail["status"], { label: string; tone: "success" | "accent" | "warning" | "neutral" }> = {
  active: { label: "ACTIVE", tone: "success" },
  trialing: { label: "TRIAL", tone: "accent" },
  past_due: { label: "PAYMENT ISSUE", tone: "warning" },
  canceled: { label: "CANCELED", tone: "neutral" },
  expired: { label: "EXPIRED", tone: "neutral" },
  revoked: { label: "REVOKED", tone: "neutral" },
  pending: { label: "PENDING", tone: "warning" },
  suspended: { label: "SUSPENDED", tone: "warning" },
};

const DAY = 24 * 60 * 60 * 1000;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function price(sub: SubscriptionDetail) {
  // What this subscriber pays, locked until renewal (D8); falls back to the plan price.
  const cents = sub.priceCents ?? sub.plan.priceCents;
  if (cents === 0) return "Free";
  const period = sub.plan.billingCycle === "annual" ? "year" : sub.plan.billingCycle === "quarterly" ? "3 months" : "month";
  return `${formatRupees(cents)} / ${period} incl. GST`;
}

/**
 * My plan (Figma Profile & Settings 03): a restyled entry point over the real
 * subscription (the same queries and cancel-at-period-end action as the
 * Subscription screen, which still owns plan switching and checkout). Plans
 * and prices are whatever the super admin has on sale in the admin portal.
 * Basic shows no renewal, remaining days or Cancel, just Upgrade, and the
 * payment-method row is gone (owner, 20 Oct 2026). The owner's four Fynrox
 * programs are listed below as information (components/FynroxProgramsSection).
 * Payments are one-time
 * Razorpay orders, so there is no auto-renewal: the Figma toggle is replaced
 * by an honest "Renews manually" row. "Change billing period" shows only when
 * the current tier has a plan with the other billing cycle.
 */
export function MyPlanScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const [canceling, setCanceling] = useState(false);
  const current = useQuery({ queryKey: ["subscriptions", "current"], queryFn: fetchCurrentSubscription });
  const plans = useQuery({ queryKey: ["subscriptions", "plans"], queryFn: fetchPlans });

  const sub = current.data;
  // Any other billing period (monthly / 3 months / yearly) on sale for this tier.
  const otherCycle = sub
    ? ((plans.data ?? []).find((p) => p.tier === sub.plan.tier && p.billingCycle !== sub.plan.billingCycle && p.priceCents > 0)
        ?.billingCycle ?? null)
    : null;
  const canChangeCycle = !!sub && sub.plan.priceCents > 0 && otherCycle != null;
  const progress = sub ? periodProgress(sub) : null;
  const daysLeft = sub?.renewsAt ? Math.max(0, Math.ceil((new Date(sub.renewsAt).getTime() - Date.now()) / DAY)) : null;
  const free = !!sub && isFreePlan(sub.plan);
  // Manual renewal (20 Oct 2026): a paid plan that is ending, has ended or whose payment failed,
  // while the plan is still on sale in admin.
  const renewable =
    !!sub &&
    !free &&
    (plans.data ?? []).some((p) => p.id === sub.plan.id) &&
    (sub.displayState === "expiring" || sub.status === "expired" || sub.status === "past_due");
  // No subscription row means the member is on the free plan.
  const freePlan = (plans.data ?? []).find((p) => isFreePlan(p));
  const cancellable =
    !!sub && !free && (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") && !sub.cancelAtPeriodEnd;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["subscriptions", "current"] }),
      queryClient.invalidateQueries({ queryKey: ["subscriptions", "history"] }),
    ]);

  const onCancel = () => {
    const renews = sub?.renewsAt ? fmtDate(sub.renewsAt) : null;
    Alert.alert(
      "Cancel plan?",
      renews
        ? `Your plan stays active until ${renews}, then it won't renew. You won't be charged again.`
        : "Your plan stays active through the end of your current billing period, then it won't renew. You won't be charged again.",
      [
        { text: "Keep plan", style: "cancel" },
        {
          text: "Cancel plan",
          style: "destructive",
          onPress: async () => {
            setCanceling(true);
            try {
              await cancelSubscription();
              await refresh();
            } catch (err) {
              Alert.alert("Couldn't cancel plan", extractErrorMessage(err, "Check your connection and try again."));
            } finally {
              setCanceling(false);
            }
          },
        },
      ],
    );
  };

  const stat = (label: string, value: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{value}</Text>
    </View>
  );

  return (
    <RecoverShell centered title="My plan" onBack={() => navigation.goBack()}>
      {current.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : current.isError ? (
        <ErrorState message="Couldn't load your plan." onRetry={() => current.refetch()} />
      ) : !sub ? (
        <View style={{ gap: spacing.md }}>
          {freePlan ? (
            // 20 Oct 2026: no subscription row means the member is on the free plan.
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md }}>
              <Text style={{ color: theme.accentText, fontFamily: fonts.displayBold, fontSize: 24 }}>{freePlan.name}</Text>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                {stat("Member since", user?.createdAt ? fmtDate(user.createdAt) : "-")}
                {stat("Price", "Free")}
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>No active plan</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Choose a plan to see what each one includes.</Text>
            </View>
          )}
          <Button label={freePlan ? "Upgrade" : "Choose a plan"} onPress={() => navigation.navigate("Subscription")} />
          <RowGroup>
            <SettingRow icon="file-text" title="Purchase history" onPress={() => navigation.navigate("SubscriptionHistory")} />
          </RowGroup>
          <FynroxProgramsSection />
        </View>
      ) : (
        <>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: theme.accentText, fontFamily: fonts.displayBold, fontSize: 24 }}>{sub.plan.name}</Text>
              <Pill label={sub.cancelAtPeriodEnd ? "ENDING" : STATUS[sub.status].label} tone={sub.cancelAtPeriodEnd ? "warning" : STATUS[sub.status].tone} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              {stat("Member since", user?.createdAt ? fmtDate(user.createdAt) : "-")}
              {free
                ? stat("Price", price(sub))
                : stat(sub.cancelAtPeriodEnd || sub.status === "expired" ? "Ends on" : "Paid until", sub.renewsAt ? fmtDate(sub.renewsAt) : "-")}
            </View>
            {progress != null && !free ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 13 }}>Remaining</Text>
                  <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 13 }}>
                    {daysLeft} day{daysLeft === 1 ? "" : "s"}
                  </Text>
                </View>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
                  <View style={{ width: `${Math.round((1 - progress) * 100)}%`, height: 5, backgroundColor: theme.accent }} />
                </View>
              </View>
            ) : null}
            {free ? null : stat("Price", price(sub))}
          </View>

          {renewable ? (
            <Button
              label={`Renew ${sub.plan.name}`}
              onPress={() => navigation.navigate("Checkout", { purpose: "subscription", referenceId: sub.plan.id })}
            />
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {canChangeCycle ? (
              <View style={{ flex: 1 }}>
                <OutlineButton
                  label="Change billing period"
                  onPress={() => navigation.navigate("Subscription", { billingCycle: otherCycle ?? undefined })}
                />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button label={free ? "Upgrade" : "Change plan"} onPress={() => navigation.navigate("Subscription")} />
            </View>
          </View>

          <RowGroup>
            <SettingRow icon="file-text" title="Purchase history" onPress={() => navigation.navigate("SubscriptionHistory")} />
            {free ? null : (
              <SettingRow
                icon="refresh-cw"
                title="Renews manually"
                subtitle="No automatic charges. We never bill you without you paying at checkout."
              />
            )}
          </RowGroup>

          {sub.status === "past_due" ? (
            <Text style={{ color: colors.warningText, ...typography.meta }}>
              Your last payment did not go through. Renew to pay again and keep your plan.
            </Text>
          ) : null}

          {cancellable ? <TextAction label={canceling ? "Cancelling…" : "Cancel plan"} danger onPress={onCancel} /> : null}

          <FynroxProgramsSection />
        </>
      )}
    </RecoverShell>
  );
}
