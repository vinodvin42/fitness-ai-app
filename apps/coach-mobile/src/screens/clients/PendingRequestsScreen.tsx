import React from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import type { PendingRelationshipItem } from "@fitness-ai-app/types";
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
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing, typography } from "../../theme/tokens";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

function relativeDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
 */
export function PendingRequestsScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-pending-requests"],
    queryFn: fetchPendingRelationships,
  });

  const invalidateAfterAction = () => {
    queryClient.invalidateQueries({ queryKey: ["coach-pending-requests"] });
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

  return (
    <ScreenContainer title="Pending Requests">
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600" }}>
        ‹ Clients
      </Text>

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
    </ScreenContainer>
  );
}
