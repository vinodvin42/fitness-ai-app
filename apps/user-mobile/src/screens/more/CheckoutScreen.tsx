import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { RazorpayCheckoutModal } from "../../components/RazorpayCheckoutModal";
import { useRazorpayPurchase } from "../../lib/useRazorpayPurchase";
import { fetchCheckoutQuote, type CheckoutMethodId } from "../../api/checkout";
import { formatRupees } from "../../lib/money";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Checkout">;

/**
 * U-M1 — "Checkout: plan, price from API, UPI / card / netbanking,
 * 'Have a code?'", and U-M2's processing state.
 *
 * DESIGN-PENDING U-M1, U-M2 — no Figma exists. Built with the shared UI
 * kit per the handoff's instruction to ship a plain version rather than
 * skip the screen.
 *
 * Every figure on this screen comes from `GET /checkout/quote`. That is
 * decision #7 ("No hard-coded prices in the app; prices come from the
 * Commerce API") taken literally: there is no price, no currency symbol
 * position and no tax rate computed here. Even the payment methods are
 * server-listed, so changing gateway does not mean shipping an app
 * update.
 *
 * U-M3 (payment failed, "you were not charged") is PaymentResultScreen,
 * which already existed — this screen hands off to it rather than
 * growing a second, divergent result state.
 */
export function CheckoutScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { purpose, referenceId, code } = route.params;
  // A code typed on the Subscription screen arrives already applied.
  const [codeInput, setCodeInput] = useState(code ?? "");
  const [appliedCode, setAppliedCode] = useState<string | undefined>(code?.trim() || undefined);
  const [method, setMethod] = useState<CheckoutMethodId>("upi");

  const quote = useQuery({
    queryKey: ["checkoutQuote", purpose, referenceId, appliedCode],
    queryFn: () => fetchCheckoutQuote({ purpose, referenceId, code: appliedCode }),
  });

  const queryClient = useQueryClient();
  const purchase = useRazorpayPurchase({
    // The plan and purchase list change once a payment is verified (20 Oct 2026).
    onVerified: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["purchaseHistory"] }),
      ]),
    onVerifyFailed: (paymentId, message, paid) =>
      navigation.replace("PaymentResult", {
        status: "unconfirmed",
        message,
        paymentId,
        internalPaymentId: paid?.paymentId,
        amountCents: paid?.amountCents,
      }),
    onSuccess: () => navigation.replace("PaymentResult", { status: "success" }),
    onError: (message) => navigation.replace("PaymentResult", { status: "failed", message }),
    onActivationFailed: (paymentId, message) =>
      navigation.replace("PaymentResult", { status: "activation_failed", message, paymentId }),
  });

  if (quote.isLoading) {
    return (
      <ScreenContainer edges={["top", "bottom"]} title={t("checkout.title")}>
        <BackButton onPress={() => navigation.goBack()} />
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (quote.isError || !quote.data) {
    return (
      <ScreenContainer edges={["top", "bottom"]} title={t("checkout.title")}>
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={quote.refetch} />
      </ScreenContainer>
    );
  }

  const q = quote.data;
  const money = (paise: number) => formatRupees(paise);

  // U-M2. Shown in place of the pay button rather than as an overlay:
  // the one thing a user must not do while a charge is in flight is tap
  // pay again, and a modal they can dismiss invites exactly that.
  const busy = purchase.isPurchasing;

  return (
    <ScreenContainer edges={["top", "bottom"]} title={t("checkout.title")} subtitle={q.itemName}>
      {/* Hidden only while an order is being created or a payment verified (`busy`, reset in finally). */}
      {busy ? null : <BackButton onPress={() => navigation.goBack()} />}
      <Card>
        <Row label={q.itemName} value={money(q.listPriceCents)} />
        {q.discountCents > 0 ? (
          <Row label={`${t("checkout.discount")}${q.couponCode ? ` (${q.couponCode})` : ""}`} value={`−${money(q.discountCents)}`} tone="success" />
        ) : null}
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />
        <Row label={t("checkout.total")} value={money(q.totalCents)} emphasis />
        {/* D3: "incl. GST" — the tax is already inside the total, broken
            out rather than added at the last step, which is what an
            Indian consumer expects to see. */}
        {q.gst ? (
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 4 }}>
            {t("checkout.inclGst", { percent: q.gst.percent, amount: money(q.gst.taxCents) })}
          </Text>
        ) : null}
        {/* D3: no trial in R1. Stated only if one is ever enabled, so
            this screen can never imply a free period that isn't real. */}
        {q.trialAvailable ? (
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 4 }}>{t("checkout.includesTrial")}</Text>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("checkout.haveACode")}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          <TextInput
            value={codeInput}
            onChangeText={setCodeInput}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={64}
            placeholder={t("checkoutCode.placeholder")}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t("checkoutCode.a11y")}
            style={{
              flex: 1,
              color: colors.textPrimary,
              backgroundColor: colors.surfaceRaised,
              borderRadius: radius.md,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
            }}
          />
          <Button
            label={t("checkout.apply")}
            variant="secondary"
            onPress={() => setAppliedCode(codeInput.trim() || undefined)}
          />
        </View>
        {/* An invalid code never blocks checkout — it shows here and the
            undiscounted price stands. Failing the whole purchase over a
            typo would be a worse outcome than charging full price. */}
        {q.couponError ? (
          <Text style={{ color: colors.warningText, ...typography.meta, marginTop: spacing.xs }}>{q.couponError}</Text>
        ) : null}
        {q.couponCode ? (
          <Text style={{ color: colors.successText, ...typography.meta, marginTop: spacing.xs }}>
            {t("checkout.codeApplied", { code: q.couponCode })}
          </Text>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("checkout.payWith")}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" }}>
          {q.methods
            .filter((m) => m.available)
            .map((m) => (
              <Chip key={m.id} label={m.label} selected={method === m.id} onPress={() => setMethod(m.id)} />
            ))}
        </View>
      </Card>

      {!q.canPay ? (
        // Honest rather than a dead button: the gateway is genuinely not
        // configured on this server.
        <Text style={{ color: colors.warningText, ...typography.meta, marginTop: spacing.md }}>
          {t("checkout.paymentsUnavailable")}
        </Text>
      ) : null}

      {busy ? (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <ActivityIndicator color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("checkout.processing.title")}</Text>
              <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                {t("checkout.processing.subtitle")}
              </Text>
            </View>
          </View>
        </Card>
      ) : q.canPay ? (
        <Button
          label={t("checkout.pay", { amount: money(q.totalCents) })}
          onPress={() => purchase.purchase(purpose, referenceId, q.couponCode ?? undefined)}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      <RazorpayCheckoutModal
        order={purchase.order}
        preferredMethod={method}
        onSuccess={purchase.onCheckoutSuccess}
        onDismiss={purchase.onCheckoutDismiss}
        onFailed={purchase.onCheckoutFailed}
      />
    </ScreenContainer>
  );
}

function Row({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "success";
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
      <Text style={{ color: colors.textSecondary, ...(emphasis ? typography.h3 : typography.body) }}>{label}</Text>
      <Text
        style={{
          color: tone === "success" ? colors.success : colors.textPrimary,
          ...(emphasis ? typography.h3 : typography.body),
        }}
      >
        {value}
      </Text>
    </View>
  );
}
