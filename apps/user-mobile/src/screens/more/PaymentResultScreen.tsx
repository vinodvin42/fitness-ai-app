import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { fetchPaymentStatus, retryPaymentActivation } from "../../api/payments";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

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
 */
export function PaymentResultScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { status, message, paymentId, internalPaymentId, amountCents } = route.params;
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
  const { data: pendingStatus } = useQuery({
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
            {success ? "✓" : "!"}
          </Text>
        </View>
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
        {!success && !pendingActivation && !unconfirmed ? (
          <Text
            style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm, textAlign: "center" }}
          >
            {t("payment.notCharged")}
          </Text>
        ) : null}
      </Card>

      {unconfirmed && amountCents != null ? (
        <Card style={{ marginTop: spacing.md, gap: 4 }}>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>Amount</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>₹{(amountCents / 100).toLocaleString("en-IN")}</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            Started {startedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {internalPaymentId ? " · checking every few seconds" : ""}
          </Text>
        </Card>
      ) : null}

      {pendingActivation ? (
        <Button label={t("payment.retryActivation")} onPress={onRetry} loading={isRetrying} style={{ marginTop: spacing.lg }} />
      ) : null}

      <Button
        label={success ? t("common.done") : pendingActivation || unconfirmed ? t("payment.checkBackLater") : t("payment.backToPlans")}
        variant={pendingActivation ? "secondary" : "primary"}
        onPress={() => navigation.navigate("Subscription")}
        style={{ marginTop: spacing.md }}
      />
    </ScreenContainer>
  );
}
