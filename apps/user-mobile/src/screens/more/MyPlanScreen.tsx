import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SubscriptionDetail } from "@fitness-ai-app/types";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { Pill } from "../../components/Pill";
import { useAuth } from "../../context/AuthContext";
import { cancelSubscription, fetchCurrentSubscription, fetchPlans } from "../../api/subscriptions";
import { extractErrorMessage } from "../../lib/apiError";
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
};

const DAY = 24 * 60 * 60 * 1000;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function price(sub: SubscriptionDetail) {
  if (sub.plan.priceCents === 0) return "Free";
  return `₹${(sub.plan.priceCents / 100).toFixed(2)} / ${sub.plan.billingCycle === "annual" ? "year" : "month"}`;
}

/**
 * My plan (Figma Profile & Settings 03): a restyled entry point over the real
 * subscription (the same queries and cancel-at-period-end action as the
 * Subscription screen, which still owns plan switching and checkout). Plans
 * are the app's real Basic / Pro / Elite lineup. Payments are one-time
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
  const otherCycle = sub ? (sub.plan.billingCycle === "monthly" ? "annual" : "monthly") : null;
  const canChangeCycle =
    !!sub && sub.plan.priceCents > 0 && (plans.data ?? []).some((p) => p.tier === sub.plan.tier && p.billingCycle === otherCycle);
  const progress = sub ? periodProgress(sub) : null;
  const daysLeft = sub?.renewsAt ? Math.max(0, Math.ceil((new Date(sub.renewsAt).getTime() - Date.now()) / DAY)) : null;
  const cancellable =
    !!sub && (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") && !sub.cancelAtPeriodEnd;

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
      <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>{label}</Text>
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
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>No active plan</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Choose a plan to unlock coaching and analytics.</Text>
          </View>
          <Button label="Choose a plan" onPress={() => navigation.navigate("Subscription")} />
          <RowGroup>
            <SettingRow icon="file-text" title="Purchase history" onPress={() => navigation.navigate("SubscriptionHistory")} />
          </RowGroup>
        </View>
      ) : (
        <>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: theme.accent, fontFamily: fonts.displayBold, fontSize: 24 }}>{sub.plan.name}</Text>
              <Pill label={sub.cancelAtPeriodEnd ? "ENDING" : STATUS[sub.status].label} tone={sub.cancelAtPeriodEnd ? "warning" : STATUS[sub.status].tone} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              {stat("Member since", user?.createdAt ? fmtDate(user.createdAt) : "-")}
              {stat(sub.cancelAtPeriodEnd ? "Ends on" : "Next renewal", sub.renewsAt ? fmtDate(sub.renewsAt) : "-")}
            </View>
            {progress != null ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>Remaining</Text>
                  <Text style={{ color: theme.accent, fontFamily: fonts.bodySemi, fontSize: 11 }}>
                    {daysLeft} day{daysLeft === 1 ? "" : "s"}
                  </Text>
                </View>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
                  <View style={{ width: `${Math.round((1 - progress) * 100)}%`, height: 5, backgroundColor: theme.accent }} />
                </View>
              </View>
            ) : null}
            {stat("Price", price(sub))}
          </View>

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
              <Button label="Change plan" onPress={() => navigation.navigate("Subscription")} />
            </View>
          </View>

          <RowGroup>
            <SettingRow icon="smartphone" title="Payment Method" value="Chosen at checkout" />
            <SettingRow icon="file-text" title="Purchase history" onPress={() => navigation.navigate("SubscriptionHistory")} />
            <SettingRow
              icon="refresh-cw"
              title="Renews manually"
              subtitle="No automatic charges. We never bill you without you paying at checkout."
            />
          </RowGroup>

          {sub.status === "past_due" ? (
            <Text style={{ color: colors.warning, ...typography.meta }}>
              Your last payment did not go through. Choose a plan to pay again and keep premium access.
            </Text>
          ) : null}

          {cancellable ? <TextAction label={canceling ? "Cancelling…" : "Cancel plan"} danger onPress={onCancel} /> : null}
        </>
      )}
    </RecoverShell>
  );
}
