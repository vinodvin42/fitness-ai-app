import React from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { BackButton } from "../../components/BackButton";
import { Pill } from "../../components/Pill";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchCoachBookings } from "../../api/coachSessions";
import { formatQuotePrice } from "../../lib/quoteFormat";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "CoachSessions">;

/** Human Coach 04 entry: every booked coach session, newest first, each opening its summary. */
export function CoachSessionsScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["coaching", "bookings"], queryFn: fetchCoachBookings });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const sorted = [...(data ?? [])].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  return (
    <ScreenContainer title="My Sessions" subtitle="Booked coach sessions and their summaries">
      <BackButton onPress={() => navigation.goBack()} />
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
          onAction={() => navigation.navigate("CoachDiscovery", undefined)}
        />
      ) : (
        sorted.map((b) => (
          <Pressable
            key={b.id}
            onPress={() => navigation.navigate("SessionSummary", { bookingId: b.id })}
            accessibilityRole="button"
            accessibilityLabel={`Session with ${b.professionalFullName}`}
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
                {b.offeringLabel} · {b.durationMinutes} min · {formatQuotePrice(b.priceCents, null)}
              </Text>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                {new Date(b.scheduledAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </Text>
              {b.hasSummary ? <Pill label="Summary available" tone="accent" icon="check" /> : null}
            </Card>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}
