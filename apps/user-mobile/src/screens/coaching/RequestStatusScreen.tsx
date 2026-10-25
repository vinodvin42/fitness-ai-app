import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CoachServiceOffering, RelationshipStatusItem } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { LearnMoreLink } from "../../components/LearnMoreSheet";
import { useToast } from "../../components/Toast";
import { DetailRow, ProfessionalRow, RequestStepBar, StateHeading, SummaryCard } from "../../components/GuidanceParts";
import { cancelCoachRequest, fetchCoachProfile, fetchRelationshipStatus } from "../../api/coaching";
import { fetchPurchaseHistory } from "../../api/checkout";
import { retryPaymentActivation } from "../../api/payments";
import { extractErrorMessage } from "../../lib/apiError";
import { formatPreferredDay, formatReplyBy, preferredDayForBooking, REQUEST_REPLY_HOURS } from "../../lib/coachRequest";
import { formatRupees } from "../../lib/money";
import { COACH_BROWSING_ENABLED } from "../../lib/coachEntry";
import { colors, fonts, radius, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "RequestStatus">;

const STATUS_KEY = ["coaching", "relationships", "status"] as const;

const roleOf = (r: RelationshipStatusItem) => (r.serviceType === "fitness" ? "Fitness Professional" : "Nutrition Professional");
const firstName = (full: string) => full.split(" ")[0];
/** The fee as the Figma writes it: "₹1,500 + GST" (fees are set before GST, which is added at payment). */
const feeText = (o: CoachServiceOffering) => (o.priceCents === 0 ? "Free" : `${formatRupees(o.priceCents)} + GST`);

/** The four-step bar position for each request state (0 = not shown). */
function stepFor(r: RelationshipStatusItem): number {
  if (r.status === "requested" || r.status === "expired") return 1;
  if (r.status === "accepted" || r.status === "awaiting_payment") return 2;
  return 0;
}

/**
 * One guidance request, full screen (Figma coach/05 pending, 06 declined, 05b expired, 07 accepted and
 * 12 connecting; 25 Oct 2026). Opened from a request card on the Coaching hub. Everything shown comes
 * from the status feed, the coach's profile (the fee for their level) and, after a failed activation,
 * the member's own purchase record.
 *
 * Since 25 Oct 2026 an accepted request has 48 hours to be paid ("Pay by"); after that it ends with
 * nothing charged (Figma coach/09, shown for an expired request that still has acceptedAt).
 *
 * Left out of the Figma on purpose, because the product doesn't do them: the coach's reason for
 * declining (kept private by design),
 * and "cancel and get a full refund" / "refunded automatically in 24 hours" after a failed activation
 * (no member refund path exists; support handles it).
 */
export function RequestStatusScreen({ navigation, route }: Props) {
  const { relationshipId } = route.params;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<"cancel" | "retry" | null>(null);

  const status = useQuery({ queryKey: STATUS_KEY, queryFn: fetchRelationshipStatus });
  const item = status.data?.relationships.find((r) => r.relationshipId === relationshipId);
  const profile = useQuery({
    queryKey: ["coaching", "professional", item?.professionalId],
    queryFn: () => fetchCoachProfile(item!.professionalId),
    enabled: !!item,
  });
  const failed = !!item && (item.status === "activation_failed" || !!item.stuck);
  const purchases = useQuery({ queryKey: ["purchaseHistory"], queryFn: fetchPurchaseHistory, enabled: failed && !!item?.paymentId });

  const back = () => navigation.goBack();

  if (status.isLoading) {
    return (
      <ScreenContainer title="Request" onBack={back}>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }
  if (status.isError || !status.data) {
    return (
      <ScreenContainer title="Request" onBack={back}>
        <ErrorState onRetry={status.refetch} />
      </ScreenContainer>
    );
  }
  if (!item) {
    // Cancelled, or finished more than 30 days ago (the feed drops it then).
    return (
      <ScreenContainer title="Request" onBack={back}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>This request is no longer open. Nothing was charged for it.</Text>
        <Button label="Back to Coaching" onPress={back} style={{ marginTop: spacing.md }} />
      </ScreenContainer>
    );
  }

  const name = item.professionalFullName;
  const first = firstName(name);
  const offering = profile.data?.offerings.find((o) => o.id === item.offeringId) ?? null;
  const level = profile.data?.level?.name ?? null;
  const sentAt = item.requestedAt ?? item.createdAt;
  const serviceLine = [item.serviceName ?? offering?.label, offering ? feeText(offering) : null].filter(Boolean).join(" · ");
  const preferred = item.preferredDate ? formatPreferredDay(item.preferredDate) : "Any day";
  const findAnother = () => (COACH_BROWSING_ENABLED ? navigation.navigate("CoachDiscovery", undefined) : navigation.navigate("RequestGuidance"));

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
      queryClient.invalidateQueries({ queryKey: ["coaching", "team"] }),
    ]);

  const confirmCancel = () =>
    Alert.alert("Cancel this request?", `${name} won't be asked to take it any more. Nothing has been charged.`, [
      { text: "Keep request", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: async () => {
          setBusy("cancel");
          try {
            await cancelCoachRequest(item.relationshipId);
            await refreshAll();
            toast.show("Request cancelled", "success");
            navigation.goBack();
          } catch (err) {
            toast.show(extractErrorMessage(err, "Couldn't cancel the request. Try again."), "error");
            await refreshAll();
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const pay = () =>
    navigation.navigate("BookingServiceSelection", {
      professionalId: item.professionalId,
      offeringId: item.offeringId ?? undefined,
      preferredDate: preferredDayForBooking(item.preferredDate) ?? undefined,
    });

  const retry = async () => {
    if (!item.paymentId) return;
    setBusy("retry");
    try {
      const result = await retryPaymentActivation(item.paymentId);
      await refreshAll();
      toast.show("You're booked", "success");
      if (result.booking) navigation.replace("BookingConfirmation", { booking: result.booking });
    } catch (err) {
      toast.show(extractErrorMessage(err, "Couldn't book that time. Pick another time."), "error");
    } finally {
      setBusy(null);
    }
  };

  const summary = (
    <SummaryCard title="Request summary">
      {serviceLine ? <DetailRow label="Service" value={serviceLine} /> : null}
      <DetailRow label="Preferred day" value={preferred} />
      {item.note ? <DetailRow label="Your note" value={item.note} /> : null}
      <DetailRow label="Sent" value={formatReplyBy(sentAt)} />
    </SummaryCard>
  );
  const professional = <ProfessionalRow name={name} role={roleOf(item)} />;
  const step = stepFor(item);

  // ---- Connecting: paid, but the session couldn't be booked (Figma coach/12) ----
  if (failed) {
    const record = purchases.data?.find((p) => p.id === item.paymentId) ?? null;
    return (
      <ScreenContainer title="Connecting" onBack={back}>
        <View style={{ gap: 18 }}>
          <View style={{ gap: 10 }}>
            <View style={{ alignSelf: "flex-start", borderRadius: radius.pill, backgroundColor: colors.successSoft, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: colors.successText, fontFamily: fonts.bodySemi, fontSize: 12 }}>Payment received</Text>
            </View>
            <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 27 }}>
              {item.stuck ? `Still connecting you to ${first}` : `We couldn't connect you to ${first} yet`}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {item.stuck
                ? `Your payment went through and your session with ${first} is still being set up. You won't be charged again.`
                : `Your payment went through, but booking your session with ${first} didn't finish. You won't be charged again.`}
            </Text>
          </View>
          <SummaryCard>
            {record ? (
              <DetailRow
                label="Payment"
                value={`${formatRupees(record.amountCents)} · paid ${formatReplyBy(record.createdAt)}`}
                valueColor={colors.successText}
              />
            ) : null}
            <DetailRow label={`Connection to ${first}`} value="Not finished" valueColor={colors.dangerText} />
            {item.paymentId ? <DetailRow label="Reference" value={item.paymentId} /> : null}
          </SummaryCard>
          <SummaryCard>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {item.stuck
                ? "If it doesn't finish soon, contact support with the reference above and we'll sort it out."
                : "Try again books the same time with the same payment. If that time has gone, pick another one. Still stuck? Contact support with the reference above."}
            </Text>
          </SummaryCard>
          {!item.stuck && item.paymentId ? (
            <>
              <Button label="Try again" onPress={() => void retry()} loading={busy === "retry"} disabled={busy !== null} />
              <Button
                label="Pick another time"
                variant="secondary"
                disabled={busy !== null}
                onPress={() => navigation.navigate("BookingServiceSelection", { professionalId: item.professionalId, rebookPaymentId: item.paymentId as string })}
              />
            </>
          ) : null}
          <Button
            label="Contact support"
            variant={item.stuck ? "primary" : "secondary"}
            onPress={() => navigation.navigate("SupportTicketForm", { category: "billing" })}
          />
        </View>
      </ScreenContainer>
    );
  }

  // ---- Declined (Figma coach/06) ----
  if (item.status === "declined") {
    return (
      <ScreenContainer title="Request" onBack={back}>
        <View style={{ gap: 18 }}>
          <StateHeading
            icon="message"
            tone="muted"
            flow="Professional Guidance / Request declined"
            title={`${first} can't take this request`}
            body="Your request was reviewed and declined. No session has been booked and you haven't been charged."
          />
          {professional}
          <SummaryCard>
            {serviceLine ? <DetailRow label="Request" value={item.serviceName ?? serviceLine} /> : null}
            <DetailRow label="Preferred day" value={preferred} />
            <DetailRow label="Payment" value="No charge · No payment taken" />
          </SummaryCard>
          <NextStep text="Choose another professional. FynroX sets each coach's fee by their level, shown before you request." />
          <Button label="Find another professional" onPress={findAnother} />
          <Button label="Back to requests" variant="secondary" onPress={back} />
        </View>
      </ScreenContainer>
    );
  }

  // ---- Expired after being accepted: the 48 hours to pay passed (Figma coach/09) ----
  if (item.status === "expired" && item.acceptedAt) {
    return (
      <ScreenContainer title="Request" onBack={back}>
        <View style={{ gap: 18 }}>
          <StateHeading
            icon="clock"
            flow="Professional Guidance / Payment window ended"
            title="The time to pay has passed"
            body={`${first} accepted your request, but it wasn't paid within 48 hours, so it ended. Nothing was charged.`}
          />
          {professional}
          <SummaryCard title="Previous request">
            {serviceLine ? <DetailRow label="Service" value={serviceLine} /> : null}
            <DetailRow label="Preferred day" value={preferred} />
            <DetailRow label="Accepted" value={formatReplyBy(item.acceptedAt)} />
            <DetailRow label="Payment" value="No charge · No payment taken" />
          </SummaryCard>
          <NextStep text={`Send ${first} a new request, or choose another professional. FynroX sets each coach's fee by their level.`} />
          {COACH_BROWSING_ENABLED ? (
            <Button label={`Request ${first} again`} onPress={() => navigation.navigate("RequestCoach", { professionalId: item.professionalId })} />
          ) : null}
          <Button label="Choose another professional" variant={COACH_BROWSING_ENABLED ? "secondary" : "primary"} onPress={findAnother} />
        </View>
      </ScreenContainer>
    );
  }

  // ---- Expired: no reply within the window (Figma coach/05b) ----
  if (item.status === "expired") {
    const deadline = new Date(Date.parse(sentAt) + REQUEST_REPLY_HOURS * 3_600_000).toISOString();
    return (
      <ScreenContainer title="Request" onBack={back}>
        <View style={{ gap: 18 }}>
          <StateHeading
            icon="clock"
            flow="Professional Guidance / Request ended"
            title={`${first} didn't reply in ${REQUEST_REPLY_HOURS} hours`}
            body="Your request ended on its own. Nothing was charged."
          />
          {professional}
          <RequestStepBar step={step} />
          {summary}
          <SummaryCard tone="accent" title="Request ended · Nothing was charged">
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {first} didn't reply by {formatReplyBy(deadline)} ({REQUEST_REPLY_HOURS} hours after you sent it), so the request ended.
            </Text>
          </SummaryCard>
          <NextStep text="Choose another professional and send a new request. FynroX sets each coach's fee by their level, shown before you request." />
          <Footnote text="No charge. Nothing was booked." />
          <Button label="Choose another professional" onPress={findAnother} />
          {COACH_BROWSING_ENABLED ? (
            <Button label={`Ask ${first} again`} variant="secondary" onPress={() => navigation.navigate("RequestCoach", { professionalId: item.professionalId })} />
          ) : (
            <Button label="Back to requests" variant="secondary" onPress={back} />
          )}
        </View>
      </ScreenContainer>
    );
  }

  // ---- Accepted: pay to book (Figma coach/07) ----
  if (item.status === "accepted" || item.status === "awaiting_payment") {
    return (
      <ScreenContainer title="Request" onBack={back}>
        <View style={{ gap: 18 }}>
          <StateHeading
            icon="check"
            flow="Professional Guidance / Request accepted"
            title={`${first} accepted your request`}
            body={
              item.status === "awaiting_payment"
                ? "You started paying but didn't finish, so nothing was charged. Pick a time and pay to book."
                : `Pick a time and pay to book your session. It's the same fee you saw on ${first}'s profile.`
            }
          />
          {professional}
          <RequestStepBar step={step} />
          <SummaryCard title="Accepted scope">
            {item.serviceName ?? offering?.label ? <DetailRow label="Service" value={(item.serviceName ?? offering?.label) as string} /> : null}
            <DetailRow label="Preferred day" value={preferred} />
            {offering ? <DetailRow label="Duration" value={`${offering.durationMinutes} minutes`} /> : null}
            {item.acceptedAt ? <DetailRow label="Accepted" value={formatReplyBy(item.acceptedAt)} /> : null}
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>Your session is booked as soon as payment is complete.</Text>
          </SummaryCard>
          {offering ? (
            <SummaryCard tone="accent">
              <Text style={{ color: colors.textSecondary, fontSize: 12, letterSpacing: 0.4 }}>
                {`FEE SET BY FYNROX FOR ${first.toUpperCase()}'S LEVEL${level ? ` (${level.toUpperCase()})` : ""}`}
              </Text>
              <Text style={{ color: colors.accentText, fontFamily: fonts.bodySemi, fontSize: 16 }}>{feeText(offering)}</Text>
              {offering.priceCents > 0 ? <DetailRow label="Total with GST" value={formatRupees(offering.totalCents)} /> : null}
              {item.payBy ? <DetailRow label="Pay by" value={formatReplyBy(item.payBy)} /> : null}
              {item.payBy ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>If you don't pay by then, the request ends and nothing is charged.</Text>
              ) : null}
            </SummaryCard>
          ) : null}
          <Footnote text="You pay FynroX. FynroX pays your coach after keeping a fee. Payments are processed by Razorpay." />
          <Button label={offering && offering.priceCents > 0 ? `Pick a time · ${feeText(offering)}` : "Pick a time"} onPress={pay} disabled={busy !== null} />
          {item.status === "accepted" ? (
            <Button label="Cancel request" variant="secondary" onPress={confirmCancel} loading={busy === "cancel"} disabled={busy !== null} />
          ) : null}
        </View>
      </ScreenContainer>
    );
  }

  // ---- Pending: waiting for the coach (Figma coach/05). Also the fallback for any other open state. ----
  return (
    <ScreenContainer title="Request" onBack={back}>
      <View style={{ gap: 18 }}>
        <StateHeading
          icon="clock"
          flow="Professional Guidance / Request pending"
          title={`Your request is with ${first}`}
          body={`${first} will review your request and confirm whether they can take it.`}
        />
        {professional}
        <RequestStepBar step={Math.max(step, 1)} />
        {summary}
        <SummaryCard tone="accent" title={`Waiting for ${first} to accept`}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {offering && offering.priceCents > 0
              ? `If ${first} accepts, you pay FynroX ${feeText(offering)} (the fee for their level) to book. Nothing is charged until then.`
              : `If ${first} accepts, you pick a time and pay to book. Nothing is charged until then.`}
          </Text>
        </SummaryCard>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
            {item.replyBy
              ? `${first} has until ${formatReplyBy(item.replyBy)} to reply, or the request ends. Nothing is charged.`
              : `${first} has ${REQUEST_REPLY_HOURS} hours to reply, or the request ends. Nothing is charged.`}
          </Text>
          <View style={{ alignSelf: "flex-start" }}>
            <LearnMoreLink topic="coach_requests" />
          </View>
        </View>
        <Footnote text="No charge. You haven't booked a paid session." />
        <Button label={`View ${first}'s profile`} onPress={() => navigation.navigate("CoachProfileDetail", { professionalId: item.professionalId })} />
        {item.status === "requested" ? (
          <Button label="Cancel request" variant="secondary" onPress={confirmCancel} loading={busy === "cancel"} disabled={busy !== null} />
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function NextStep({ text }: { text: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Your next step</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

function Footnote({ text }: { text: string }) {
  return <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: "center" }}>{text}</Text>;
}
