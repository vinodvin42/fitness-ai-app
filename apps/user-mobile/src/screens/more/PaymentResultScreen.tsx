import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { fetchPaymentStatus, retryPaymentActivation } from "../../api/payments";
import { fetchCurrentSubscription } from "../../api/subscriptions";
import { extractErrorMessage } from "../../lib/apiError";
import { featuresFor, isFreePlan } from "../../lib/planLineup";
import { formatRupees } from "../../lib/money";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { TextAction } from "./profileParts";

type Props = NativeStackScreenProps<MoreStackParamList, "PaymentResult">;

/**
 * Payment Success / Failed (docs/mobile/03-screen-inventory.md §M), added 31
 * Aug 2026 — dedicated result screens replacing the checkout flow's inline
 * Alert, reached from SubscriptionScreen via useRazorpayPurchase's
 * onSuccess/onError. Program/Workout purchases keep the lighter Alert path
 * (they don't pass those callbacks).
 *
 * **U6 Premium entitlement (15 Sep 2026, §9 / BR-COM-011):** a third,
 * genuinely distinct state — `activation_failed` — closes the "payment
 * success + entitlement failure must show a recoverable user state, not
 * 'payment failed'" gap. Before this, the only two states this screen knew
 * were "success" and "failed" — and Razorpay capturing the money but the
 * server-side subscribe() call throwing right after (a DB hiccup, nothing
 * exotic — see payments.service.ts's activatePayment doc comment) landed
 * here as "failed", which is a lie: the user WAS charged. This state tells
 * the truth (payment captured, activation didn't finish) and gives a real
 * Retry action (`POST /payments/:id/retry-activation`) that re-runs only
 * the entitlement grant — never a second charge. While this screen is open
 * on that state, it also quietly polls the payment's own real status (`GET
 * /payments/:id`) — Razorpay retries failed webhook deliveries on its own
 * schedule, so activation can resolve in the background even if the user
 * never taps Retry themselves; the screen flips itself to the honest
 * success state the moment that happens, rather than making them guess.
 *
 * 25 Oct 2026 (Figma payments/03, 04, 11): the screens now say what was
 * bought and for how much. Success shows a receipt (item, amount, paid-until,
 * payment id, date) and what the plan unlocks; failure shows the item, amount
 * and time with "Try again" (back to Checkout, where the method can be
 * changed) and "Contact support"; a payment still being confirmed has a
 * "Check status" button. Everything shown is already known to the app: the
 * payment method is not stored, so no method row; and no refund timing is
 * promised that the product doesn't already state elsewhere.
 */
export function PaymentResultScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { status, message, paymentId, internalPaymentId, amountCents, itemName, purpose, referenceId, code } = route.params;
  const [startedAt] = useState(() => new Date());
  const queryClient = useQueryClient();
  const [isRetrying, setIsRetrying] = useState(false);
  const [resolvedActivated, setResolvedActivated] = useState(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
      queryClient.invalidateQueries({ queryKey: ["purchaseHistory"] }),
    ]);

  // 20 Oct 2026: a success (or a payment still being confirmed) must show the
  // new plan once the member leaves this screen, never the old one.
  useEffect(() => {
    if (status === "success" || status === "unconfirmed") refresh();
  }, [status]);

  // Background poll — only while this screen is genuinely showing the
  // activation_failed state, only when we have a real paymentId to check,
  // and stops itself the moment activation is confirmed (a webhook
  // redelivery resolved it, or a Retry tap succeeded).
  const { data: polledStatus } = useQuery({
    queryKey: ["payments", "status", paymentId],
    queryFn: () => fetchPaymentStatus(paymentId!),
    enabled: status === "activation_failed" && !!paymentId && !resolvedActivated,
    refetchInterval: (query) => (query.state.data?.activatedAt ? false : 5000),
    refetchIntervalInBackground: false,
  });

  const activatedViaPoll = !!polledStatus?.activatedAt;

  // Figma payments/11 (24 Oct 2026): a payment Razorpay took but we couldn't
  // confirm (often UPI still settling) — check our record every few seconds
  // until it is paid and active, or failed.
  const {
    data: pendingStatus,
    refetch: refetchPending,
    isFetching: checkingPending,
  } = useQuery({
    queryKey: ["payments", "status", internalPaymentId],
    queryFn: () => fetchPaymentStatus(internalPaymentId!),
    enabled: status === "unconfirmed" && !!internalPaymentId,
    refetchInterval: (query) => {
      const s = query.state.data;
      return s && ((s.status === "paid" && s.activatedAt) || s.status === "failed") ? false : 5000;
    },
    refetchIntervalInBackground: false,
  });
  const confirmedLater = status === "unconfirmed" && pendingStatus?.status === "paid" && !!pendingStatus.activatedAt;
  const failedLater = status === "unconfirmed" && pendingStatus?.status === "failed";
  useEffect(() => {
    if (confirmedLater) refresh();
  }, [confirmedLater]);

  // The webhook redelivery (or another retry) resolved it in the background
  // while this screen was open — make sure Subscription/History reflect
  // that the moment the user leaves this screen, without needing a tap.
  // Deliberately keyed on activatedViaPoll alone — refresh() (invalidating
  // the subscriptions queries) is idempotent and cheap to re-run; the flag
  // is the only signal that should ever re-trigger it here. This project's
  // eslint config has no react-hooks/exhaustive-deps rule to satisfy.
  useEffect(() => {
    if (activatedViaPoll) refresh();
  }, [activatedViaPoll]);

  const onRetry = async () => {
    if (!paymentId) {
      Alert.alert("Can't retry", "This payment couldn't be identified — contact support if you were charged.");
      return;
    }
    setIsRetrying(true);
    try {
      await retryPaymentActivation(paymentId);
      await refresh();
      setResolvedActivated(true);
    } catch (err) {
      Alert.alert("Still couldn't activate", extractErrorMessage(err, "Check your connection and try again in a moment."));
    } finally {
      setIsRetrying(false);
    }
  };

  const activated = resolvedActivated || activatedViaPoll;
  const success = status === "success" || (status === "activation_failed" && activated) || confirmedLater;
  const pendingActivation = status === "activation_failed" && !activated;
  const unconfirmed = status === "unconfirmed" && !confirmedLater && !failedLater;
  const failed = !success && !pendingActivation && !unconfirmed;

  // The plan the member is on now: its end date and what it adds over the free plan.
  const isPlanPurchase = purpose !== "program_purchase";
  const current = useQuery({
    queryKey: ["subscriptions", "current"],
    queryFn: fetchCurrentSubscription,
    enabled: success && isPlanPurchase,
  });
  const plan = current.data && !current.isFetching && !isFreePlan(current.data.plan) ? current.data : null;
  const unlocked = plan ? featuresFor(plan.plan.tier, "basic") : [];

  const money = (cents: number) => formatRupees(cents);
  const clock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const longDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const goToday = () => {
    navigation.popToTop();
    (navigation.getParent() as { navigate: (name: string) => void } | undefined)?.navigate("Today");
  };

  return (
    <ScreenContainer
      edges={["top", "bottom"]}
      title={
        success
          ? t("payment.successTitle")
          : pendingActivation
            ? t("payment.activatingTitle")
            : unconfirmed
              ? t("payment.unconfirmedTitle")
              : t("payment.failedTitle")
      }
    >
      <Card style={{ alignItems: "center", paddingVertical: spacing.xl }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: success
              ? "rgba(34,197,94,0.15)"
              : pendingActivation || unconfirmed
                ? colors.warningSoft
                : "rgba(239,68,68,0.15)",
          }}
        >
          <Text style={{ fontSize: 32, color: success ? colors.success : pendingActivation || unconfirmed ? colors.warning : colors.danger }}>
            {success ? "✓" : failed ? "✕" : "!"}
          </Text>
        </View>
        {unconfirmed ? (
          <View style={{ marginTop: spacing.md }}>
            <Pill label={t("payment.waitingForBank")} tone="warning" />
          </View>
        ) : null}
        <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.md, textAlign: "center" }}>
          {success
            ? t("payment.allSet")
            : pendingActivation
              ? t("payment.received")
              : unconfirmed
                ? t("payment.unconfirmedHeading")
                : t("payment.wentWrong")}
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.xs, textAlign: "center" }}>
          {success
            ? t("payment.activeNow")
            : pendingActivation
              ? (message ?? t("payment.activationPending"))
              : unconfirmed
                ? t("payment.unconfirmedBody", { id: paymentId ?? "—" })
                : (message ?? t("payment.didNotGoThrough"))}
        </Text>
        {/* U-M3 explicitly names this line: a failed payment must say
            "you were not charged". It used to be part of the default
            message, which meant a gateway-supplied `message` REPLACED
            it — dropping the reassurance in exactly the case where the
            user is most worried, and most likely to try paying again.
            It is now always shown on failure, alongside any specific
            reason. */}
        {failed ? (
          <Text
            style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm, textAlign: "center" }}
          >
            {t("payment.notCharged")}
          </Text>
        ) : null}
      </Card>

      {/* Receipt (success) / what was attempted (failed, still confirming). */}
      {success && (itemName || amountCents != null) ? (
        <Card style={{ marginTop: spacing.md, gap: spacing.xs }}>
          {itemName ? <Detail label={t("payment.rowItem")} value={itemName} /> : null}
          {amountCents != null ? <Detail label={t("payment.rowAmountPaid")} value={money(amountCents)} emphasis /> : null}
          {plan?.renewsAt ? <Detail label={t("payment.rowPaidUntil")} value={longDate(new Date(plan.renewsAt))} /> : null}
          <Detail label={t("payment.rowPaidOn")} value={`${longDate(startedAt)}, ${clock(startedAt)}`} />
          {paymentId || internalPaymentId ? <Detail label={t("payment.rowPaymentId")} value={(paymentId ?? internalPaymentId)!} small /> : null}
        </Card>
      ) : null}

      {success && unlocked.length > 0 ? (
        <Card style={{ marginTop: spacing.md, gap: spacing.xs }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("payment.unlocked")}</Text>
          {unlocked.map((key) => (
            <View key={key} style={{ flexDirection: "row", gap: spacing.sm }}>
              <Text style={{ color: colors.success }}>✓</Text>
              <Text style={{ flex: 1, color: colors.textSecondary }}>{t(`subscription.features.${key}`)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {(failed || unconfirmed) && (itemName || amountCents != null) ? (
        <Card style={{ marginTop: spacing.md, gap: spacing.xs }}>
          {itemName ? <Detail label={t("payment.rowFor")} value={itemName} /> : null}
          {amountCents != null ? <Detail label={t("payment.rowAmount")} value={money(amountCents)} emphasis /> : null}
          <Detail label={failed ? t("payment.rowTime") : t("payment.rowStarted")} value={clock(startedAt)} />
          {unconfirmed && paymentId ? <Detail label={t("payment.rowReference")} value={paymentId} small /> : null}
          {unconfirmed && internalPaymentId ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("payment.checkingEvery")}</Text>
          ) : null}
        </Card>
      ) : null}

      {pendingActivation ? (
        <Button label={t("payment.retryActivation")} onPress={onRetry} loading={isRetrying} style={{ marginTop: spacing.lg }} />
      ) : null}

      {success ? (
        <>
          <Button label={t("payment.startExploring")} onPress={goToday} style={{ marginTop: spacing.lg }} />
          <Button label={t("payment.viewMyPlan")} variant="secondary" onPress={() => navigation.navigate("Subscription")} style={{ marginTop: spacing.sm }} />
        </>
      ) : null}

      {failed ? (
        <>
          {purpose && referenceId ? (
            <>
              <Button
                label={t("payment.tryAgain")}
                onPress={() => navigation.replace("Checkout", { purpose, referenceId, code })}
                style={{ marginTop: spacing.lg }}
              />
              <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", marginTop: spacing.xs }}>
                {t("payment.pickAnotherMethod")}
              </Text>
            </>
          ) : null}
          <Button
            label={t("payment.contactSupport")}
            variant="secondary"
            onPress={() => navigation.navigate("Support")}
            style={{ marginTop: spacing.sm }}
          />
          <TextAction label={t("payment.backToPlans")} onPress={() => navigation.navigate("Subscription")} />
        </>
      ) : null}

      {unconfirmed ? (
        <>
          {internalPaymentId ? (
            <Button
              label={t("payment.checkStatus")}
              onPress={() => refetchPending()}
              loading={checkingPending}
              style={{ marginTop: spacing.lg }}
            />
          ) : null}
          <Button
            label={t("payment.backToToday")}
            variant="secondary"
            onPress={goToday}
            style={{ marginTop: internalPaymentId ? spacing.sm : spacing.lg }}
          />
        </>
      ) : null}

      {pendingActivation ? (
        <Button
          label={t("payment.checkBackLater")}
          variant="secondary"
          onPress={() => navigation.navigate("Subscription")}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </ScreenContainer>
  );
}

function Detail({ label, value, emphasis, small }: { label: string; value: string; emphasis?: boolean; small?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }}>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
      <Text
        selectable={small}
        style={{
          flexShrink: 1,
          textAlign: "right",
          color: colors.textPrimary,
          ...(emphasis ? { fontFamily: fonts.bodySemi, fontSize: 16 } : small ? typography.meta : typography.body),
        }}
      >
        {value}
      </Text>
    </View>
  );
}
