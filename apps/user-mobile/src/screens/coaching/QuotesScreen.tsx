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
import { fetchQuoteRequests } from "../../api/coachSessions";
import {
  effectiveQuoteStatus,
  formatQuotePrice,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  quoteServiceLabel,
  useNow,
} from "../../lib/quoteFormat";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Quotes">;

/** Human Coach quote requests: pending, received, declined, accepted and expired. Refetches on focus and every 30s while open (no realtime). */
export function QuotesScreen({ navigation }: Props) {
  const now = useNow(30000);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "quoteRequests"],
    queryFn: fetchQuoteRequests,
    refetchInterval: 30000,
  });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <ScreenContainer title="Guidance requests" subtitle="Requests, quotes and their status">
      <BackButton onPress={() => navigation.goBack()} />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={84} />
          <Skeleton height={84} />
        </View>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No guidance requests yet"
          subtitle="Open a professional's profile and tap Request guidance. Nothing is charged when you send a request."
          actionLabel="Find a professional"
          onAction={() => navigation.navigate("CoachDiscovery", undefined)}
        />
      ) : (
        (data ?? []).map((q) => {
          const status = effectiveQuoteStatus(q, now);
          return (
            <Pressable
              key={q.id}
              onPress={() => navigation.navigate("QuoteDetail", { quoteId: q.id })}
              accessibilityRole="button"
              accessibilityLabel={`Guidance request to ${q.professionalFullName ?? "professional"}, ${QUOTE_STATUS_LABEL[status]}`}
            >
              <Card style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                  <Text style={{ color: colors.textPrimary, ...typography.h3, flex: 1 }}>{q.professionalFullName ?? "Professional"}</Text>
                  <Pill label={QUOTE_STATUS_LABEL[status]} tone={QUOTE_STATUS_TONE[status]} />
                </View>
                <Text style={{ color: colors.textSecondary }}>{quoteServiceLabel(q.serviceType)}</Text>
                {q.quotedPriceCents != null && (status === "quoted" || status === "accepted") ? (
                  <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{formatQuotePrice(q.quotedPriceCents, q.currency)}</Text>
                ) : null}
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  Requested {new Date(q.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
              </Card>
            </Pressable>
          );
        })
      )}
    </ScreenContainer>
  );
}
