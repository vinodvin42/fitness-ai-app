import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { fetchPurchaseHistory, type PurchaseRecord } from "../../api/checkout";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Purchases">;

/**
 * U-M22 — "Refund status in purchase history".
 *
 * DESIGN-PENDING U-M22. The Refund model has existed since 31 Aug 2026
 * but only Admin could see one, so a user whose refund was approved had
 * no way to tell whether it had been issued, was pending with the
 * gateway, or had failed. That is exactly the moment someone contacts
 * support, so the gap was expensive as well as wrong.
 *
 * Refund status is shown ON the purchase rather than as a separate list:
 * "did I get my money back" is a question about a purchase, not about an
 * event a user would think to go looking for.
 */
/**
 * Tone only. The label and detail for each state moved into the
 * catalogue (`purchases.refund.*`) on 29 Sep 2026 — a colour is a design
 * decision and belongs in the component; a sentence is copy and belongs
 * somewhere a translator can reach it.
 */
const REFUND_TONE: Record<string, "accent" | "success" | "warning" | "danger"> = {
  pending: "accent",
  processed: "success",
  failed: "danger",
};

const PURPOSE_LABEL: Record<string, string> = {
  subscription: "Premium",
  program_purchase: "Programme",
  booking: "Professional session",
};

export function PurchaseHistoryScreen(_props: Props) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["purchaseHistory"],
    queryFn: fetchPurchaseHistory,
  });

  if (isLoading) {
    return (
      <ScreenContainer title={t("purchases.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (isError) {
    return (
      <ScreenContainer title={t("purchases.title")}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  const purchases = data ?? [];
  if (purchases.length === 0) {
    return (
      <ScreenContainer title={t("purchases.title")}>
        <EmptyState title={t("purchases.empty.title")} subtitle={t("purchases.empty.subtitle")} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t("purchases.title")} subtitle={t("purchases.subtitle")}>
      <View style={{ gap: spacing.sm }}>
        {purchases.map((p) => (
          <PurchaseCard key={p.id} purchase={p} />
        ))}
      </View>
    </ScreenContainer>
  );
}

function PurchaseCard({ purchase }: { purchase: PurchaseRecord }) {
  const { t } = useTranslation();
  const money = (cents: number) => `₹${(cents / 100).toFixed(2)}`;
  const refundTone = purchase.refund ? REFUND_TONE[purchase.refund.status] : null;

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, paddingRight: spacing.sm }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
            {PURPOSE_LABEL[purchase.purpose] ?? purchase.purpose}
          </Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
            {new Date(purchase.createdAt).toLocaleDateString()}
            {purchase.couponCode ? ` · ${purchase.couponCode}` : ""}
          </Text>
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{money(purchase.amountCents)}</Text>
      </View>

      {/* §10: a refund never rewrites the payment's own status — the
          payment really did succeed. Both facts are shown, rather than
          one overwriting the other. */}
      {refundTone && purchase.refund ? (
        <View style={{ marginTop: spacing.sm }}>
          <Pill label={t(`purchases.refund.${purchase.refund.status}.label`)} tone={refundTone} />
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
            {t(`purchases.refund.${purchase.refund.status}.detail`)}
          </Text>
          {purchase.refund.isPartial ? (
            <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
              {t("purchases.refund.partial", { amount: money(purchase.refund.refundedCents) })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* The access-recovery signal. The money left the user's account
          and the entitlement did not arrive — saying nothing here is how
          a support ticket becomes a chargeback. */}
      {purchase.activationFailed ? (
        <View style={{ marginTop: spacing.sm }}>
          <Pill label={t("purchases.activationFailed.label")} tone="warning" />
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
            {t("purchases.activationFailed.detail")}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
