import React from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
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
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

function relativeDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
 * FynroX" — added below Client Requests, backing the new admin-proposes-
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
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-pending-requests"],
    queryFn: fetchPendingRelationships,
  });

  const offersQuery = useQuery({
    queryKey: ["coach-professional-offers"],
    queryFn: fetchProfessionalOffers,
  });

  const invalidateAfterAction = () => {
    queryClient.invalidateQueries({ queryKey: ["coach-pending-requests"] });
    queryClient.invalidateQueries({ queryKey: ["coach-clients"] });
  };

  const invalidateAfterOfferAction = () => {
    queryClient.invalidateQueries({ queryKey: ["coach-professional-offers"] });
    queryClient.invalidateQueries({ queryKey: ["coach-clients"] });
  };

  const acceptMutation = useMutation({
    mutationFn: (relationshipId: string) => acceptRelationshipRequest(relationshipId),
    onSuccess: invalidateAfterAction,
    onError: (err) => Alert.alert("Couldn't accept this request", extractErrorMessage(err, "Please try again.")),
  });

  const declineMutation = useMutation({
    mutationFn: (relationshipId: string) => declineRelationshipRequest(relationshipId),
    onSuccess: invalidateAfterAction,
    onError: (err) => Alert.alert("Couldn't decline this request", extractErrorMessage(err, "Please try again.")),
  });

  const acceptOfferMutation = useMutation({
    mutationFn: (offerId: string) => acceptProfessionalOffer(offerId),
    onSuccess: invalidateAfterOfferAction,
    onError: (err) => Alert.alert("Couldn't accept this offer", extractErrorMessage(err, "Please try again.")),
  });

  const declineOfferMutation = useMutation({
    mutationFn: (offerId: string) => declineProfessionalOffer(offerId),
    onSuccess: invalidateAfterOfferAction,
    onError: (err) => Alert.alert("Couldn't decline this offer", extractErrorMessage(err, "Please try again.")),
  });

  const confirmDecline = (item: PendingRelationshipItem) => {
    Alert.alert(
      "Decline this request?",
      `${item.userFullName} won't be notified of a reason unless you add one later — they'll see this request was declined.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: () => declineMutation.mutate(item.relationshipId),
        },
      ],
    );
  };

  const confirmDeclineOffer = (item: ProfessionalOfferForCoach) => {
    Alert.alert(
      "Decline this offer?",
      `FynroX proposed ${item.userFullName} as a new client. Declining won't notify them of a reason.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: () => declineOfferMutation.mutate(item.offerId),
        },
      ],
    );
  };

  return (
    <ScreenContainer title="Pending Requests">
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        ‹ Clients
      </Text>

      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.lg }}>Client Requests</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Users who requested you directly.</Text>

      {isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.requests.length === 0 && (
        <EmptyState
          title="No pending requests"
          subtitle="When a user requests you as their coach, their request will show up here for you to accept or decline."
        />
      )}

      {data && data.requests.length > 0 && (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {data.requests.map((item) => {
            const isBusy =
              (acceptMutation.isPending && acceptMutation.variables === item.relationshipId) ||
              (declineMutation.isPending && declineMutation.variables === item.relationshipId);
            return (
              <Card key={item.relationshipId}>
                <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{item.userFullName}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {SERVICE_LABELS[item.serviceType] ?? item.serviceType} · Requested {relativeDay(item.createdAt)}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Button
                    label="Accept"
                    onPress={() => acceptMutation.mutate(item.relationshipId)}
                    loading={isBusy && acceptMutation.isPending}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Decline"
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

      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: spacing.xl }}>Offers from FynroX</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
        FynroX proposed you as this client's coach — accepting creates the relationship.
      </Text>

      {offersQuery.isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      {offersQuery.isError && <ErrorState onRetry={() => offersQuery.refetch()} />}

      {offersQuery.data && offersQuery.data.offers.length === 0 && (
        <EmptyState
          title="No offers right now"
          subtitle="When FynroX proposes you as a coach for a specific client, it'll show up here for you to accept or decline."
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
                    You haven't responded to this yet — FynroX support can see this too.
                  </Text>
                )}
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <Button
                    label="Accept"
                    onPress={() => acceptOfferMutation.mutate(item.offerId)}
                    loading={isBusy && acceptOfferMutation.isPending}
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Decline"
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
