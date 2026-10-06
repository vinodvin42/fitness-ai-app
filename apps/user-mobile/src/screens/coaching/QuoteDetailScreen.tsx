import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { QuoteRequest } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { InfoCard, StateLayout } from "../../components/StatePanels";
import { BodyText, ProfessionalRow, RequestStepBar, SummaryCard } from "../../components/GuidanceParts";
import { useToast } from "../../components/Toast";
import { acceptQuoteRequest, cancelQuoteRequest, fetchQuoteRequest } from "../../api/coachSessions";
import { extractErrorMessage } from "../../lib/apiError";
import {
  effectiveQuoteStatus,
  firstName,
  formatCountdown,
  formatDay,
  formatDayTime,
  formatQuotePrice,
  quoteServiceLabel,
  useNow,
} from "../../lib/quoteFormat";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "QuoteDetail">;

const ROLE: Record<QuoteRequest["serviceType"], string> = {
  fitness: "Fitness Professional",
  nutrition: "Nutrition Professional",
  combined: "Fitness + Nutrition Professional",
};

/**
 * Professional Guidance request states (Figma 05-08, 11): pending, declined,
 * quote received, quote accepted -> payment confirmation, expired (+ a plain
 * cancelled/paid state). Four-step bar: Requested -> Accepted -> Your approval
 * -> Pay. No realtime channel: refetches on focus and every 20s while open.
 *
 * Accepting a quote only reserves it; "Pay quoted fee" hands the quote id to
 * the booking flow, whose Razorpay order charges the quoted price server-side
 * (accepted quotes must be paid within 48h). Nothing is charged by this screen.
 */
export function QuoteDetailScreen({ navigation, route }: Props) {
  const { quoteId } = route.params;
  const queryClient = useQueryClient();
  const toast = useToast();
  const now = useNow(1000);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

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

  const store = (q: QuoteRequest) => {
    queryClient.setQueryData(["coaching", "quoteRequests", quoteId], q);
    queryClient.invalidateQueries({ queryKey: ["coaching", "quoteRequests"] });
  };

  const accept = useMutation({
    mutationFn: () => acceptQuoteRequest(quoteId),
    onSuccess: (res) => {
      store(res.quoteRequest);
      toast.show("Quote accepted. No payment taken yet.", "success");
    },
    onError: (err) => {
      toast.show(extractErrorMessage(err, "Couldn't accept that quote. It may have expired."), "error");
      refetch();
    },
  });

  const cancel = useMutation({
    mutationFn: () => cancelQuoteRequest(quoteId),
    onSuccess: (q) => {
      store(q);
      setConfirmCancel(false);
    },
    onError: (err) => {
      toast.show(extractErrorMessage(err, "Couldn't cancel that request."), "error");
      setConfirmCancel(false);
      refetch();
    },
  });

  if (isError) {
    return (
      <ScreenContainer title="Request">
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState onRetry={() => refetch()} />
      </ScreenContainer>
    );
  }
  if (isLoading || !data) {
    return (
      <ScreenContainer title="Request">
        <BackButton onPress={() => navigation.goBack()} />
        <Skeleton height={160} />
      </ScreenContainer>
    );
  }

  const status = effectiveQuoteStatus(data, now);
  const name = data.professionalFullName ?? "Your professional";
  const first = firstName(data.professionalFullName);
  const back = () => navigation.goBack();
  const toRequests = () => navigation.navigate("Quotes");
  const findAnother = () => navigation.navigate("CoachDiscovery", undefined);
  const requestAgain = () =>
    navigation.navigate("RequestQuote", {
      professionalId: data.professionalId,
      professionalName: data.professionalFullName ?? undefined,
      serviceType: data.serviceType,
      message: data.message,
    });
  const header = (step?: number) => (
    <>
      <ProfessionalRow name={name} role={ROLE[data.serviceType]} />
      {step ? <RequestStepBar step={step} /> : null}
    </>
  );
  const preferred = data.preferredAt ? formatDay(data.preferredAt) : null;
  const price = formatQuotePrice(data.quotedPriceCents, data.currency);
  const scopeRows = (): Array<[string, string]> => {
    const rows: Array<[string, string]> = [["Service", quoteServiceLabel(data.serviceType)]];
    if (preferred) rows.push(["Preferred date", preferred]);
    return rows;
  };

  if (status === "pending") {
    return (
      <StateLayout
        onBack={back}
        showBrand
        flowIcon="clock"
        flowLabel="Professional Guidance / Request pending"
        title={`Your request is with ${first}`}
        description={`${first} will review your request before confirming availability, scope and a fee.`}
        footnote="No charge. You have not booked a paid session."
        actions={[
          { label: "View request", onPress: toRequests },
          {
            label: confirmCancel ? "Tap again to cancel this request" : "Cancel request",
            variant: "secondary",
            onPress: () => (confirmCancel ? cancel.mutate() : setConfirmCancel(true)),
            loading: cancel.isPending,
          },
        ]}
      >
        {header(1)}
        <SummaryCard title="Request summary" rows={[...scopeRows(), ["Sent", formatDayTime(data.createdAt)]]} />
        <InfoCard
          tone="accent"
          title="Waiting for professional acceptance"
          body={`If ${first} accepts, you'll receive a quote to review. Nothing is charged until you confirm the quoted fee and choose to pay.`}
        />
        <BodyText muted>You can cancel while the request is pending. We'll keep your request status here; no response time is guaranteed.</BodyText>
      </StateLayout>
    );
  }

  if (status === "declined") {
    return (
      <StateLayout
        onBack={back}
        showBrand
        flowIcon="message"
        flowTone="neutral"
        flowLabel="Professional Guidance / Request declined"
        title={`${first} can't take this request`}
        description="Your request was reviewed and declined. No session has been booked and you haven't been charged."
        actions={[
          { label: "Find another professional", onPress: findAnother },
          { label: "Back to requests", variant: "secondary", onPress: toRequests },
        ]}
      >
        {header()}
        <SummaryCard title={`Reason from ${first}`}>
          <BodyText>{data.quoteNote ? `"${data.quoteNote}"` : `${first} didn't give a reason.`}</BodyText>
          {data.respondedAt ? <Text style={{ color: colors.textMuted, ...typography.meta }}>{formatDayTime(data.respondedAt)}</Text> : null}
        </SummaryCard>
        <SummaryCard rows={[...scopeRows(), ["Payment", "No charge · No payment taken"]]} />
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.accent, ...typography.label }}>Your next step</Text>
          <BodyText>
            Browse other professionals and send a new request. Each professional confirms their own availability, scope and fee before you pay.
          </BodyText>
        </View>
      </StateLayout>
    );
  }

  if (status === "quoted") {
    return (
      <StateLayout
        onBack={back}
        showBrand
        flowIcon="file-text"
        flowLabel="Professional Guidance / Quote received"
        title="Request accepted · Quote received"
        description="Review the professional's scope and quote. Accepting the quote takes you to fee confirmation, not an automatic charge."
        footnote="No charge yet. Payment is a separate step."
        actions={[
          { label: "Review & accept quote", onPress: () => accept.mutate(), loading: accept.isPending },
          {
            label: confirmCancel ? "Tap again to decline this quote" : "Decline quote",
            variant: "secondary",
            onPress: () => (confirmCancel ? cancel.mutate() : setConfirmCancel(true)),
            loading: cancel.isPending,
            disabled: accept.isPending,
          },
        ]}
      >
        {header(2)}
        <SummaryCard title="Accepted scope" rows={scopeRows()}>
          <BodyText>{data.quoteNote ?? `${first} didn't add a scope note to this quote.`}</BodyText>
        </SummaryCard>
        <SummaryCard tone="accent">
          <Text style={{ color: colors.textMuted, ...typography.caption, letterSpacing: 0.6 }}>FEE PROVIDED BY {name.toUpperCase()}</Text>
          <Text style={{ color: colors.accent, ...typography.h3 }}>Professional's quoted fee</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{price}</Text>
          {data.quoteExpiresAt ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>Valid until</Text>
              <Text style={{ color: colors.textPrimary, ...typography.label, flex: 1, textAlign: "right" }}>
                {formatDayTime(data.quoteExpiresAt)}
                {formatCountdown(data.quoteExpiresAt, now) ? ` · ${formatCountdown(data.quoteExpiresAt, now)}` : ""}
              </Text>
            </View>
          ) : null}
          <BodyText muted>Confirm the actual professional quote before paying. No standard coaching tariff applies.</BodyText>
        </SummaryCard>
      </StateLayout>
    );
  }

  if (status === "accepted") {
    return (
      <StateLayout
        onBack={back}
        showBrand
        flowIcon="shield-check"
        flowLabel="Professional Guidance / Payment confirmation"
        title="Quote accepted"
        description={`You accepted ${first}'s quote. Check the agreed scope and fee one last time; no payment has been taken.`}
        footnote="Professional guidance is separate from programs and app plans. Pay within 48 hours of accepting."
        actions={[
          {
            label: "Pay quoted fee",
            disabled: !confirmed,
            onPress: () => navigation.navigate("BookingServiceSelection", { professionalId: data.professionalId, quoteRequestId: data.id }),
          },
          { label: "Back to quote", variant: "secondary", onPress: back },
        ]}
      >
        {header(3)}
        <SummaryCard title="Accepted scope" rows={scopeRows()}>
          <BodyText>{data.quoteNote ?? `${first} didn't add a scope note to this quote.`}</BodyText>
          <BodyText muted>The session is not booked until payment is completed. Next you'll choose a time, then pay.</BodyText>
        </SummaryCard>
        <SummaryCard tone="accent">
          <Text style={{ color: colors.textMuted, ...typography.caption, letterSpacing: 0.6 }}>AMOUNT TO CONFIRM</Text>
          <Text style={{ color: colors.accent, ...typography.h3 }}>Professional's quoted fee</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{price}</Text>
          <BodyText muted>Provided by {name}. Review the authoritative quote, including any applicable taxes.</BodyText>
        </SummaryCard>
        <Pressable
          onPress={() => setConfirmed((c) => !c)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: confirmed ? colors.accent : colors.borderStrong,
              backgroundColor: confirmed ? colors.accent : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {confirmed ? <Icon name="check" size={13} color="#fff" strokeWidth={3} /> : null}
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.meta, flex: 1 }}>
            I confirm the professional's quoted fee and accepted scope before payment.
          </Text>
        </Pressable>
      </StateLayout>
    );
  }

  if (status === "expired") {
    return (
      <StateLayout
        onBack={back}
        showBrand
        flowIcon="clock"
        flowTone="warning"
        flowLabel="Professional Guidance / Quote expired"
        title="This quote has expired"
        description={`${first} accepted your request, but the quote's validity window has ended. The old quote can no longer be paid.`}
        footnote="No charge. No paid session was booked."
        actions={[
          { label: "Request refreshed quote", onPress: requestAgain },
          { label: "Find another professional", variant: "secondary", onPress: findAnother },
        ]}
      >
        {header()}
        <SummaryCard tone="warning" title="Quote closed · Not a declined request">
          {data.quoteExpiresAt ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>Expired at</Text>
              <Text style={{ color: colors.textPrimary, ...typography.label }}>{formatDayTime(data.quoteExpiresAt)}</Text>
            </View>
          ) : null}
        </SummaryCard>
        <SummaryCard title="Previous quote · Reference only" rows={[...scopeRows(), ["Previous fee", price]]}>
          {data.quoteNote ? <BodyText>{data.quoteNote}</BodyText> : null}
        </SummaryCard>
        <BodyText>
          Ask {first} to confirm availability and send an updated scope and fee. A refreshed quote needs your review and acceptance again before payment.
        </BodyText>
      </StateLayout>
    );
  }

  if (status === "consumed") {
    return (
      <StateLayout
        onBack={back}
        showBrand
        flowIcon="check"
        flowLabel="Professional Guidance / Paid"
        title="Quote paid"
        description={`You paid ${first}'s quoted fee. Your session is booked.`}
        actions={[
          { label: "View my sessions", onPress: () => navigation.navigate("CoachSessions") },
          { label: "Back to requests", variant: "secondary", onPress: toRequests },
        ]}
      >
        {header(4)}
        <SummaryCard title="Paid scope" rows={[...scopeRows(), ["Fee", price]]} />
      </StateLayout>
    );
  }

  // cancelled
  return (
    <StateLayout
      onBack={back}
      showBrand
      flowIcon="circle-x"
      flowTone="neutral"
      flowLabel="Professional Guidance / Request cancelled"
      title="Request cancelled"
      description="You withdrew this request. Nothing was charged and no session was booked."
      actions={[
        { label: "Request again", onPress: requestAgain },
        { label: "Back to requests", variant: "secondary", onPress: toRequests },
      ]}
    >
      {header()}
      <SummaryCard title="Request summary" rows={[...scopeRows(), ["Sent", formatDayTime(data.createdAt)]]} />
    </StateLayout>
  );
}
