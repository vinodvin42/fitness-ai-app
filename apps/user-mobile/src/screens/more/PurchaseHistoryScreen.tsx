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
import { formatRupees } from "../../lib/money";
import { moneyTimeline, refundsInProgress, type MoneyEntry } from "../../lib/moneyTimeline";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
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
 * 24 Oct 2026 (Figma payments/10 "Every charge and refund"): one money
 * timeline, newest first. A charge is money out (−), its refund is its own
 * row of money back (+), dated when it happened, and a refund still on its
 * way is also pinned at the top. No arrival date is promised: the gateway
 * doesn't give one, so the pending text says what is known.
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
  subscription: "Plan",
  program_purchase: "Programme",
  booking: "Coach session",
};

const itemName = (p: PurchaseRecord) => p.itemName ?? PURPOSE_LABEL[p.purpose] ?? p.purpose;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

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

  const entries = moneyTimeline(purchases);
  return (
    <ScreenContainer title={t("purchases.title")} subtitle={t("purchases.subtitle")}>
      {refundsInProgress(purchases).map((p) => (
        <RefundInProgressCard key={p.id} purchase={p} />
      ))}
      <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Every charge and refund</Text>
      <Card style={{ paddingVertical: spacing.xs }}>
        {entries.map((e, i) => (
          <EntryRow key={e.key} entry={e} first={i === 0} />
        ))}
      </Card>
    </ScreenContainer>
  );
}

function RefundInProgressCard({ purchase }: { purchase: PurchaseRecord }) {
  const { t } = useTranslation();
  const refund = purchase.refund!;
  return (
    <Card style={{ gap: spacing.xs, borderColor: colors.accent }}>
      <Text style={{ color: colors.accentText, fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1 }}>REFUND IN PROGRESS</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
        <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h3 }}>{itemName(purchase)}</Text>
        <Text style={{ color: colors.successText, ...typography.h3 }}>+{formatRupees(refund.refundedCents)}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Started</Text>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{day(refund.requestedAt)}</Text>
      </View>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("purchases.refund.pending.detail")}</Text>
    </Card>
  );
}

function EntryRow({ entry, first }: { entry: MoneyEntry; first: boolean }) {
  const { t } = useTranslation();
  const p = entry.purchase;
  const isRefund = entry.kind === "refund";
  const status = entry.refundStatus;
  const failed = isRefund && status === "failed";

  const title = isRefund ? `Refund · ${itemName(p)}` : itemName(p);
  const sub = isRefund
    ? `${day(entry.at)} · ${t(`purchases.refund.${status}.label`)}`
    : `${day(entry.at)}${p.couponCode ? ` · ${p.couponCode}` : ""}`;
  const amount = failed ? "—" : `${isRefund ? "+" : "−"}${formatRupees(entry.amountCents)}`;

  return (
    <View style={{ paddingVertical: spacing.sm, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border, gap: spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{title}</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>{sub}</Text>
        </View>
        <Text
          style={{ color: failed ? colors.textMuted : isRefund ? colors.successText : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}
          accessibilityLabel={failed ? "No money returned" : `${isRefund ? "Money back" : "Paid"} ${formatRupees(entry.amountCents)}`}
        >
          {amount}
        </Text>
      </View>

      {/* §10: a refund never rewrites the payment's own status — the
          payment really did succeed. Both facts are shown, as two rows. */}
      {isRefund && status ? (
        <>
          {status !== "pending" ? <Pill label={t(`purchases.refund.${status}.label`)} tone={REFUND_TONE[status]} /> : null}
          {status === "processed" ? <Text style={{ color: colors.textSecondary, ...typography.meta }}>{t("purchases.refund.processed.detail")}</Text> : null}
          {status === "failed" ? <Text style={{ color: colors.textSecondary, ...typography.meta }}>{t("purchases.refund.failed.detail")}</Text> : null}
          {p.refund?.isPartial && !failed ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("purchases.refund.partial", { amount: formatRupees(p.refund.refundedCents) })}</Text>
          ) : null}
        </>
      ) : null}

      {/* The access-recovery signal. The money left the user's account
          and the entitlement did not arrive — saying nothing here is how
          a support ticket becomes a chargeback. */}
      {!isRefund && p.activationFailed ? (
        <>
          <Pill label={t("purchases.activationFailed.label")} tone="warning" />
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>{t("purchases.activationFailed.detail")}</Text>
        </>
      ) : null}
    </View>
  );
}
