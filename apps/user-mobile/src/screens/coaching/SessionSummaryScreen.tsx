import React from "react";
import { Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Pill } from "../../components/Pill";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { fetchBookingSummary } from "../../api/coachSessions";
import { formatQuotePrice } from "../../lib/quoteFormat";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "SessionSummary">;

/** Human Coach 04: the coach's written summary of one session, or an honest "not published yet" state. */
export function SessionSummaryScreen({ navigation, route }: Props) {
  const { bookingId } = route.params;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "bookings", bookingId, "summary"],
    queryFn: () => fetchBookingSummary(bookingId),
  });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <ScreenContainer title="Session Summary">
      <BackButton onPress={() => navigation.goBack()} />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Skeleton height={160} />
      ) : (
        <>
          <Card style={{ gap: spacing.xs }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{data.professionalFullName}</Text>
            <Text style={{ color: colors.textSecondary }}>
              {data.offeringLabel} · {data.durationMinutes} min · {formatQuotePrice(data.priceCents, null)}
            </Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {new Date(data.scheduledAt).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </Text>
            <Pill label={data.status === "confirmed" ? "Confirmed" : "Cancelled"} tone={data.status === "confirmed" ? "success" : "neutral"} />
          </Card>

          <Card style={{ gap: spacing.xs }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Coach's notes</Text>
            {data.summaryText ? (
              <>
                <Text style={{ color: colors.textSecondary, ...typography.body, lineHeight: 22 }}>{data.summaryText}</Text>
                {data.summaryPublishedAt ? (
                  <Text style={{ color: colors.textMuted, ...typography.meta }}>
                    Shared {new Date(data.summaryPublishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={{ color: colors.textSecondary }}>
                Your coach hasn't published a summary for this session yet. Check back after the session.
              </Text>
            )}
          </Card>

          <Button
            label="Message coach"
            variant="secondary"
            onPress={() => navigation.navigate("MessageThread", { professionalId: data.professionalId, fullName: data.professionalFullName })}
          />
        </>
      )}
    </ScreenContainer>
  );
}
