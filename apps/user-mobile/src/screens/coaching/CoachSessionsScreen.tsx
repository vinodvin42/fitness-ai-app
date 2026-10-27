import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchCoachBookings, fetchCredits } from "../../api/coachSessions";
import { formatRupees } from "../../lib/money";
import { formatDay, formatSessionPrice } from "../../lib/sessionFormat";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { COACH_BROWSING_ENABLED } from "../../lib/coachEntry";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachSessions">;

/**
 * Human Coach 04 entry: every booked coach session, newest first, each opening its summary.
 * Booking changes (27 Oct 2026): a row whose coach proposed a new time says so, and a banner at the top
 * shows the member's unspent session credits (from cancelling or declining a new time).
 */
export function CoachSessionsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["coaching", "bookings"], queryFn: fetchCoachBookings });
  const credits = useQuery({ queryKey: ["coaching", "credits"], queryFn: fetchCredits });
  const refetchCredits = credits.refetch;

  useFocusEffect(
    React.useCallback(() => {
      refetch();
      refetchCredits();
    }, [refetch, refetchCredits]),
  );

  const sorted = [...(data ?? [])].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const creditItems = credits.data ?? [];
  const creditTotal = creditItems.reduce((sum, c) => sum + c.amountCents, 0);
  const earliestExpiry = creditItems.reduce<string | null>((min, c) => (min == null || c.expiresAt < min ? c.expiresAt : min), null);

  return (
    <ScreenContainer title="My Sessions" subtitle="Booked coach sessions and their summaries" onBack={() => navigation.goBack()}>
      {creditItems.length > 0 && earliestExpiry ? (
        <View
          accessibilityRole="summary"
          style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success }}
        >
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{t("bookingChanges.credits.banner", { count: creditItems.length })}</Text>
          <Text style={{ color: colors.textSecondary }}>
            {t("bookingChanges.credits.detail", { count: creditItems.length, total: formatRupees(creditTotal), date: formatDay(earliestExpiry) })}
          </Text>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("bookingChanges.credits.hint")}</Text>
        </View>
      ) : null}
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          subtitle="When you book a session with a coach it will appear here."
          actionLabel="Find a coach"
          onAction={() => (COACH_BROWSING_ENABLED ? navigation.navigate("CoachDiscovery", undefined) : navigation.navigate("RequestGuidance"))}
        />
      ) : (
        sorted.map((b) => {
          // A proposal lapses once the session starts, so only an upcoming confirmed one shows it.
          const hasProposal = b.status === "confirmed" && !!b.proposedScheduledAt && new Date(b.scheduledAt).getTime() > Date.now();
          return (
            <Pressable
              key={b.id}
              onPress={() => navigation.navigate("SessionSummary", { bookingId: b.id })}
              accessibilityRole="button"
              accessibilityLabel={`Session with ${b.professionalFullName}${hasProposal ? `, ${t("bookingChanges.proposal.badge")}` : ""}`}
            >
              <Card style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h3, flex: 1 }}>{b.professionalFullName}</Text>
                  <Pill
                    label={b.status === "cancelled" ? "Cancelled" : new Date(b.scheduledAt).getTime() > Date.now() ? "Upcoming" : "Completed"}
                    tone={b.status === "cancelled" ? "neutral" : "success"}
                  />
                </View>
                <Text style={{ color: colors.textSecondary }}>
                  {b.offeringLabel} · {b.durationMinutes} min · {formatSessionPrice(b.priceCents, null)}
                </Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  {new Date(b.scheduledAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </Text>
                {hasProposal ? <Pill label={t("bookingChanges.proposal.badge")} tone="warning" icon="clock" /> : null}
                {b.hasSummary ? <Pill label="Summary available" tone="accent" icon="check" /> : null}
              </Card>
            </Pressable>
          );
        })
      )}
    </ScreenContainer>
  );
}
