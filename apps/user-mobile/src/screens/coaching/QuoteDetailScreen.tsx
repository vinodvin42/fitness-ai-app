import React from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Pill } from "../../components/Pill";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { useToast } from "../../components/Toast";
import { acceptQuoteRequest, fetchQuoteRequest } from "../../api/coachSessions";
import { extractErrorMessage } from "../../lib/apiError";
import {
  effectiveQuoteStatus,
  formatCountdown,
  formatQuotePrice,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  quoteServiceLabel,
  useNow,
} from "../../lib/quoteFormat";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "QuoteDetail">;

/**
 * One quote request in any state: pending (Coach 05), declined (06), quote
 * received with expiry countdown (07), accepted -> continue to booking (08),
 * expired -> request again (09). No realtime channel: refetches on focus and
 * every 20s while pending/quoted.
 *
 * Pricing: "Continue to booking" hands the quote id to the booking flow, which
 * sends it to POST /payments/razorpay/orders; the server then charges the
 * quoted price (accepted quotes must be paid within 48h).
 */
export function QuoteDetailScreen({ navigation, route }: Props) {
  const { quoteId } = route.params;
  const queryClient = useQueryClient();
  const toast = useToast();
  const now = useNow(1000);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coaching", "quoteRequests", quoteId],
    queryFn: () => fetchQuoteRequest(quoteId),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "pending" || s === "quoted" ? 20000 : false;
    },
  });

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const accept = useMutation({
    mutationFn: () => acceptQuoteRequest(quoteId),
    onSuccess: (res) => {
      queryClient.setQueryData(["coaching", "quoteRequests", quoteId], res.quoteRequest);
      queryClient.invalidateQueries({ queryKey: ["coaching", "quoteRequests"] });
      toast.show("Quote accepted", "success");
    },
    onError: (err) => {
      toast.show(extractErrorMessage(err, "Couldn't accept that quote. It may have expired."), "error");
      refetch();
    },
  });

  const status = data ? effectiveQuoteStatus(data, now) : null;
  const coachName = data?.professionalFullName ?? "your coach";

  return (
    <ScreenContainer title="Quote Request" subtitle={data?.professionalFullName ?? undefined}>
      <BackButton onPress={() => navigation.goBack()} />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data || !status ? (
        <Skeleton height={160} />
      ) : (
        <>
          <Card style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2, flex: 1 }}>{quoteServiceLabel(data.serviceType)}</Text>
              <Pill label={QUOTE_STATUS_LABEL[status]} tone={QUOTE_STATUS_TONE[status]} />
            </View>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Your message</Text>
            <Text style={{ color: colors.textSecondary }}>{data.message}</Text>
          </Card>

          {status === "pending" ? (
            <Card style={{ gap: spacing.xs }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Waiting for {coachName}</Text>
              <Text style={{ color: colors.textSecondary }}>
                Your request was sent. This page checks for a reply every few seconds while it's open. You can leave and come back.
              </Text>
            </Card>
          ) : null}

          {status === "declined" ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{coachName} can't take this on</Text>
              <Text style={{ color: colors.textSecondary }}>
                {data.quoteNote ?? "They declined this request. You can try another coach or send a revised request."}
              </Text>
              <Button label="Find another coach" onPress={() => navigation.navigate("CoachDiscovery", undefined)} />
              <Button
                label="Request again"
                variant="secondary"
                onPress={() =>
                  navigation.navigate("RequestQuote", {
                    professionalId: data.professionalId,
                    professionalName: data.professionalFullName ?? undefined,
                    serviceType: data.serviceType,
                    message: data.message,
                  })
                }
              />
            </Card>
          ) : null}

          {status === "quoted" ? (
            <>
              <Card style={{ gap: spacing.xs }}>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>Quoted price</Text>
                <Text style={{ color: colors.textPrimary, ...typography.metricLarge }}>
                  {formatQuotePrice(data.quotedPriceCents, data.currency)}
                </Text>
                {data.quoteExpiresAt ? (
                  <Pill label={formatCountdown(data.quoteExpiresAt, now) ?? "Expired"} tone="warning" icon="clock" />
                ) : null}
                {data.quoteNote ? (
                  <>
                    <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.sm }}>Note from {coachName}</Text>
                    <Text style={{ color: colors.textSecondary }}>{data.quoteNote}</Text>
                  </>
                ) : null}
              </Card>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                Accepting reserves this quote and takes you to booking. Payment is taken when you book a session, at the
                quoted price.
              </Text>
              <Button label="Accept quote" onPress={() => accept.mutate()} loading={accept.isPending} />
              <Button label="Not now" variant="secondary" onPress={() => navigation.goBack()} disabled={accept.isPending} />
            </>
          ) : null}

          {status === "accepted" ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Quote accepted</Text>
              <Text style={{ color: colors.textSecondary }}>
                Next, choose a service and a time with {coachName} to confirm and pay.
              </Text>
              {data.quotedPriceCents != null ? (
                <Text style={{ color: colors.textMuted, ...typography.meta }}>
                  You'll pay your quoted price of {formatQuotePrice(data.quotedPriceCents, data.currency)} at checkout. Book within 48
                  hours of accepting.
                </Text>
              ) : null}
              <Button
                label="Continue to booking"
                onPress={() => navigation.navigate("BookingServiceSelection", { professionalId: data.professionalId, quoteRequestId: data.id })}
              />
            </Card>
          ) : null}

          {status === "expired" ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>This quote has expired</Text>
              <Text style={{ color: colors.textSecondary }}>
                The offer is no longer available. You can ask {coachName} for a fresh quote.
              </Text>
              <Button
                label="Request again"
                onPress={() =>
                  navigation.navigate("RequestQuote", {
                    professionalId: data.professionalId,
                    professionalName: data.professionalFullName ?? undefined,
                    serviceType: data.serviceType,
                    message: data.message,
                  })
                }
              />
            </Card>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
