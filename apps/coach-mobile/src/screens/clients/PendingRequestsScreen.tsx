import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { PendingRelationshipItem, ProfessionalOfferForCoach } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import {
  acceptRelationshipRequest,
  declineRelationshipRequest,
  fetchPendingRelationships,
} from "../../api/relationshipRequests";
import {
  acceptProfessionalOffer,
  declineProfessionalOffer,
  fetchProfessionalOffers,
} from "../../api/professionalOffers";
import { extractErrorCode, extractErrorMessage } from "../../lib/apiError";
import { confirmAction, showAlert } from "../../lib/dialogs";
import { colors, radius, spacing, typography } from "../../theme/tokens";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };
/** The member's time to pay after an accept: the API's PAYMENT_WINDOW_MS (lib/relationshipActivation.ts). */
const PAYMENT_WINDOW_HOURS = 48;

function relativeDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The member's preferred start day. The API stores it at UTC midnight, so it's read in UTC (as the member app does) to avoid sliding a day. */
function preferredDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** When the reply window closes, in the coach's own time zone: "Mon, Oct 27, 4:20 PM". */
function replyByLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 13, flexShrink: 1, textAlign: "right", marginLeft: spacing.md }}>
        {value}
      </Text>
    </View>
  );
}

/** What the member asked for (25 Oct 2026): the service, a preferred day, a note, and when the reply window closes. */
function RequestDetails({ item }: { item: PendingRelationshipItem }) {
  const { t } = useTranslation();
  // A request made before 25 Oct carries none of these; "Any day" would then claim a preference nobody stated.
  const hasDetails = !!(item.serviceName || item.preferredDate || item.note);
  return (
    <>
      {hasDetails ? (
        <View style={{ marginTop: spacing.sm }}>
          {item.serviceName ? <DetailRow label={t("clients.pending.askedFor")} value={item.serviceName} /> : null}
          <DetailRow
            label={t("clients.pending.preferredDay")}
            value={item.preferredDate ? preferredDayLabel(item.preferredDate) : t("clients.pending.anyDay")}
          />
          {item.note ? (
            <View style={{ marginTop: spacing.xs }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t("clients.pending.note")}</Text>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: 14,
                  marginTop: 4,
                  padding: spacing.sm,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surfaceRaised,
                }}
              >
                {item.note}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {item.replyBy ? (
        <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "600", marginTop: spacing.sm }}>
          {t("clients.pending.replyBy", { when: replyByLabel(item.replyBy) })}
        </Text>
      ) : null}
    </>
  );
}

// Same 72-hour "stalled" threshold as apps/api's professionalOffers.service
// .ts#STALLED_OFFER_THRESHOLD_MS (Wave 6, 22 Sep 2026) — deliberately the
// same number so this client-side note and the admin queue's own
// `professional_acceptance_stalled` item agree on what "stalled" means,
// rather than inventing a second, different definition here. Purely
// informational (an honest "you haven't responded yet" nudge) — doesn't
// change accept/decline behavior or gate anything.
const STALLED_OFFER_THRESHOLD_MS = 72 * 60 * 60 * 1000;

function isStalled(createdAtIso: string): boolean {
  return Date.now() - new Date(createdAtIso).getTime() >= STALLED_OFFER_THRESHOLD_MS;
}

/**
 * Pending Requests (gap §56, added 16 Sep 2026) — the real coach-side
 * review gate this build never had: before this, `claimRelationship()`
 * auto-advanced a brand-new request straight to `accepted` with nothing
 * for a coach to ever see or act on (docs/coach's own screen inventory
 * confirmed no request-review screen existed anywhere, per gap §49's own
 * audit). Every `requested` relationship for this professional now shows
 * up here with real Accept/Decline actions wired to
 * POST /professionals/me/relationships/:id/accept|decline — see apps/api's
 * coaching.service.ts's acceptRelationship()/declineRelationship() for the
 * atomic claim-once discipline behind both.
 *
 * Reached from the Clients list (ClientsListScreen's own banner) rather
 * than as a 6th bottom tab — no design source names a dedicated tab for
 * this, and Clients is the closest existing real screen in this app's
 * navigation to "people relating to this coach", same "extend the closest
 * real screen rather than invent a new nav surface with no design behind
 * it" precedent MainTabs.tsx's own doc comment already used for Calendar/
 * Messages/Clients themselves.
 *
 * **R2 Wave 2 (20 Sep 2026):** a second, real section — "Offers from
 * Fynrox" — added below Client Requests, backing the new admin-proposes-
 * a-specific-pro flow (professionalOffers.service.ts). Deliberately a
 * SECOND section on this same screen, not merged into one indistinguishable
 * list with Client Requests above: a Relationship request already exists as
 * its own row the moment a user taps "Request" (see coaching.service.ts's
 * claimRelationship), while a ProfessionalOffer is a separate row that only
 * creates a Relationship once accepted here — two different real flows,
 * kept visually distinct rather than silently combined. Reuses this
 * screen (rather than a third nav surface) for the same "extend the
 * closest real screen" reasoning as the top comment above.
 */
export function PendingRequestsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-pending-requests"],
    queryFn: fetchPendingRelationships,
  });

  const offersQuery = useQuery({
    queryKey: ["coach-professional-offers"],
    // Wrapped rather than passed directly: fetchProfessionalOffers now
    // takes an optional status filter (P-M7), and React Query would
    // otherwise hand it a query context object as that argument.
    queryFn: () => fetchProfessionalOffers("offered"),
  });

  // `coach-alerts` is the header badge's count (25 Oct 2026), so it drops as soon as the coach answers.
  const invalidateAfterAction = () => {
    queryClient.invalidateQueries({ queryKey: ["coach-pending-requests"] });
    queryClient.invalidateQueries({ queryKey: ["coach-clients"] });
    queryClient.invalidateQueries({ queryKey: ["coach-alerts"] });
  };

  const invalidateAfterOfferAction = () => {
    queryClient.invalidateQueries({ queryKey: ["coach-professional-offers"] });
    queryClient.invalidateQueries({ queryKey: ["coach-clients"] });
    queryClient.invalidateQueries({ queryKey: ["coach-alerts"] });
  };

  // A request that sat past its reply window (25 Oct 2026): the API answers 409
  // `relationship_expired`. Said plainly on the screen (not an Alert, which
  // react-native-web can't show) and the list refreshes, which drops it.
  const [expiredRequest, setExpiredRequest] = useState<PendingRelationshipItem | null>(null);

  const onRequestError = (title: string) => (err: unknown, item: PendingRelationshipItem) => {
    if (extractErrorCode(err) === "relationship_expired") {
      setExpiredRequest(item);
      invalidateAfterAction();
      return;
    }
    showAlert(title, extractErrorMessage(err, "Please try again."));
  };

  const acceptMutation = useMutation({
    mutationFn: (item: PendingRelationshipItem) => acceptRelationshipRequest(item.relationshipId),
    onMutate: () => setExpiredRequest(null),
    onSuccess: (_data, item) => {
      invalidateAfterAction();
      // A next step instead of a card that just vanishes (26 Oct 2026). Chat
      // opens once they pay, so there's nothing to message yet.
      showAlert(
        "Request accepted",
        `${item.userFullName.split(" ")[0]} has been told and has ${PAYMENT_WINDOW_HOURS} hours to complete payment. They'll appear under Clients, and you can message them, once they pay.`,
      );
    },
    onError: onRequestError("Couldn't accept this request"),
  });

  const declineMutation = useMutation({
    mutationFn: (item: PendingRelationshipItem) => declineRelationshipRequest(item.relationshipId),
    onMutate: () => setExpiredRequest(null),
    onSuccess: invalidateAfterAction,
    onError: onRequestError("Couldn't decline this request"),
  });

  const acceptOfferMutation = useMutation({
    mutationFn: (offerId: string) => acceptProfessionalOffer(offerId),
    onSuccess: invalidateAfterOfferAction,
    onError: (err) => showAlert("Couldn't accept this offer", extractErrorMessage(err, "Please try again.")),
  });

  const declineOfferMutation = useMutation({
    mutationFn: (offerId: string) => declineProfessionalOffer(offerId),
    onSuccess: invalidateAfterOfferAction,
    onError: (err) => showAlert("Couldn't decline this offer", extractErrorMessage(err, "Please try again.")),
  });

  const confirmDecline = (item: PendingRelationshipItem) => {
    confirmAction(
      "Decline this request?",
      `${item.userFullName} won't be notified of a reason unless you add one later — they'll see this request was declined.`,
      "Decline",
      () => declineMutation.mutate(item),
    );
  };

  const confirmDeclineOffer = (item: ProfessionalOfferForCoach) => {
    confirmAction(
      "Decline this offer?",
      `Fynrox proposed ${item.userFullName} as a new client. Declining won't notify them of a reason.`,
      "Decline",
      () => declineOfferMutation.mutate(item.offerId),
    );
  };

  return (
    <ScreenContainer title={t("clients.pending.title")}>
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        ‹ Clients
      </Text>

      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.lg }}>{t("clients.pending.requests")}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t("clients.pending.requestsNote")}</Text>

      {expiredRequest ? (
        <Card style={{ borderWidth: 1, borderColor: colors.warning, marginTop: spacing.sm }}>
          <Text accessibilityRole="alert" style={{ color: colors.warning, fontWeight: "700", fontSize: 15 }}>
            {t("clients.pending.expiredTitle")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
            {t("clients.pending.expiredBody", { name: expiredRequest.userFullName })}
          </Text>
          <Text
            onPress={() => setExpiredRequest(null)}
            accessibilityRole="button"
            style={{ color: colors.accent, fontWeight: "600", marginTop: spacing.sm }}
          >
            {t("clients.pending.dismiss")}
          </Text>
        </Card>
      ) : null}

      {isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.requests.length === 0 && (
        <EmptyState
          title={t("clients.pending.emptyTitle")}
          subtitle={t("clients.pending.emptySubtitle")}
        />
      )}

      {data && data.requests.length > 0 && (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {data.requests.map((item) => {
            const isBusy =
              (acceptMutation.isPending && acceptMutation.variables?.relationshipId === item.relationshipId) ||
              (declineMutation.isPending && declineMutation.variables?.relationshipId === item.relationshipId);
            return (
              <Card key={item.relationshipId}>
                <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{item.userFullName}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {SERVICE_LABELS[item.serviceType] ?? item.serviceType} · Requested{" "}
                  {relativeDay(item.requestedAt ?? item.createdAt)}
                </Text>
                <RequestDetails item={item} />
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Button
                    label={t("common.accept")}
                    onPress={() => acceptMutation.mutate(item)}
                    loading={isBusy && acceptMutation.isPending}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={t("common.decline")}
                    variant="secondary"
                    onPress={() => confirmDecline(item)}
                    loading={isBusy && declineMutation.isPending}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.xl }}>{t("clients.pending.offers")}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
        {t("clients.pending.offerNote")}
      </Text>

      {offersQuery.isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      {offersQuery.isError && <ErrorState onRetry={() => offersQuery.refetch()} />}

      {offersQuery.data && offersQuery.data.offers.length === 0 && (
        <EmptyState
          title={t("clients.pending.offersEmptyTitle")}
          subtitle={t("clients.pending.offersEmptySubtitle")}
        />
      )}

      {offersQuery.data && offersQuery.data.offers.length > 0 && (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {offersQuery.data.offers.map((item) => {
            const isBusy =
              (acceptOfferMutation.isPending && acceptOfferMutation.variables === item.offerId) ||
              (declineOfferMutation.isPending && declineOfferMutation.variables === item.offerId);
            return (
              <Card key={item.offerId}>
                <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{item.userFullName}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {SERVICE_LABELS[item.serviceType] ?? item.serviceType} · Proposed {relativeDay(item.createdAt)}
                  {item.expiresAt ? ` · Expires ${relativeDay(item.expiresAt)}` : ""}
                </Text>
                {isStalled(item.createdAt) && (
                  <Text style={{ color: colors.warning, fontSize: 12, marginTop: 2 }}>
                    {t("clients.pending.notResponded")}
                  </Text>
                )}
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Button
                    label={t("common.accept")}
                    onPress={() => acceptOfferMutation.mutate(item.offerId)}
                    loading={isBusy && acceptOfferMutation.isPending}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={t("common.decline")}
                    variant="secondary"
                    onPress={() => confirmDeclineOffer(item)}
                    loading={isBusy && declineOfferMutation.isPending}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </ScreenContainer>
  );
}
