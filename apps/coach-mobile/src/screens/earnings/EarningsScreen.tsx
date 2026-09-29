import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { StatusBadge } from "../../components/StatusBadge";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { fetchEarnings } from "../../api/professionalDashboard";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Earnings">;

const money = (cents: number) => `₹${(cents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const STATUS_COPY: Record<string, string> = {
  eligible: "Earned, not yet approved for payout.",
  approved: "Approved — included in the next payout run.",
  pending: "In a payout run, on its way to your account.",
  paid: "Paid.",
  payout_failed: "The transfer didn't go through.",
};

/**
 * P6 — the earnings surface, which did not exist in this app at all.
 *
 * DESIGN-PENDING. The handoff lists earnings, payout pending/paid/failed
 * and earnings history among the Professional App's complete-as-designed
 * screens; none of them had been built.
 *
 * Two things this screen is careful about, both because it is about
 * somebody's income:
 *
 * 1. A failed payout leads, rather than sitting in a row. The cause is
 *    almost always the professional's own bank details, and every day it
 *    goes unnoticed is a day they are not paid.
 * 2. The current-month figure is derived from per-session bookings,
 *    which only exist under the marketplace model decision #4 turns off.
 *    Rather than show a confident ₹0.00, it says where the number comes
 *    from — a professional seeing zero and concluding they earned nothing
 *    this month is a support ticket at best.
 */
export function EarningsScreen(_props: Props) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["professionalEarnings"],
    queryFn: fetchEarnings,
  });

  if (isLoading) {
    return (
      <ScreenContainer title={t("earnings.title")}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (isError || !data) {
    return (
      <ScreenContainer title={t("earnings.title")}>
        <ErrorState onRetry={refetch} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title={t("earnings.title")}>
      <Text style={{ color: colors.textMuted, ...typography.meta, marginBottom: spacing.lg }}>
        FynroX takes {data.commissionPct}% commission on what you earn.
      </Text>
      {data.payoutFailure ? (
        <Card style={{ borderColor: colors.danger, marginBottom: spacing.lg }}>
          <Text style={{ color: colors.danger, ...typography.h2 }}>{t("earnings.payoutFailed")}</Text>
          <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
            {money(data.payoutFailure.amountCents)} across {data.payoutFailure.count} settlement
            {data.payoutFailure.count === 1 ? "" : "s"} couldn't be transferred. The money is still owed to you and
            will be retried.
          </Text>
          {data.payoutFailure.reason ? (
            <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>
              {data.payoutFailure.reason}
            </Text>
          ) : null}
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
            {t("earnings.bankDetailsNote")}
          </Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <StatTile label={t("earnings.paidToYou")} value={money(data.lifetimePaidCents)} />
        <StatTile label={t("earnings.awaitingPayout")} value={money(data.awaitingPayoutCents)} />
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("earnings.thisMonth")}</Text>
        <Text style={{ color: colors.textPrimary, ...typography.h1, marginTop: spacing.xs }}>
          {money(data.currentMonth.netCents)}
        </Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
          {money(data.currentMonth.grossCents)} gross · {money(data.currentMonth.commissionCents)} commission
        </Text>
        {/* Said out loud rather than shown as a confident zero. */}
        {data.currentMonth.derivedFromBookings && !data.currentMonth.hasBookingData ? (
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>
            This figure counts per-session bookings, which aren't part of how clients reach you right now. Your income
            appears in the settlements below instead.
          </Text>
        ) : null}
      </Card>

      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Settlements
      </Text>

      {data.settlements.length === 0 ? (
        <EmptyState
          title={t("earnings.emptyTitle")}
          subtitle={t("earnings.emptySubtitle")}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {data.settlements.map((s) => (
            <Card key={s.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
                    {new Date(s.periodStart).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                    {money(s.grossCents)} gross · {s.commissionPct}% commission
                  </Text>
                </View>
                <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{money(s.netCents)}</Text>
              </View>

              <View style={{ marginTop: spacing.sm }}>
                <StatusBadge status={s.status} />
                <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>
                  {STATUS_COPY[s.status] ?? s.status}
                </Text>
                {s.payoutFailureReason && s.status === "payout_failed" ? (
                  <Text style={{ color: colors.danger, ...typography.meta, marginTop: 2 }}>
                    {s.payoutFailureReason}
                  </Text>
                ) : null}
                {s.paidAt ? (
                  <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>
                    Paid {new Date(s.paidAt).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: 4 }}>{value}</Text>
    </Card>
  );
}
