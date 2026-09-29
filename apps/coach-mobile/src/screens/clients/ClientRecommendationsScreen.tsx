import React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { DecideRecommendationInput, Recommendation } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { decideClientRecommendation, fetchClientRecommendations } from "../../api/professionalClients";
import { extractErrorMessage } from "../../lib/apiError";
import type { ClientsStackParamList } from "../../navigation/ClientsStack";
import { colors, spacing, typography } from "../../theme/tokens";

/**
 * Client Recommendations (Wave 2.4, 20 Sep 2026) — the coach-side review
 * screen `docs/coach/07-open-questions-gaps.md`'s dated entry for this
 * wave names as missing: `plans.service.ts#decideRecommendation` has
 * accepted a `decidedByRole: "professional"` parameter since it was
 * written (14 Sep 2026), but nothing ever called it that way, and no
 * coach-mobile screen existed to let a coach actually act on one. This is
 * that screen — the direct sibling of apps/user-mobile's own
 * WhyThisChangedScreen.tsx, same real Approve/Decline-shaped actions
 * (`accept`/`decline`/`modify`), same real `RecommendationStatus`
 * treatment (a `no_change` decision is a first-class positive outcome,
 * never an error), just professional-authed and scoped to one client.
 *
 * Reached from ClientProfileScreen (its own "Recommendations" card/button)
 * — the natural home once a coach is already looking at that specific
 * client — rather than inventing a new nav surface with no design source
 * behind it, same "extend the closest real screen" precedent
 * PendingRequestsScreen.tsx's own doc comment already used.
 *
 * Unlike the consumer app's screen (which reviews the one CURRENT
 * recommendation), this lists every real pending one for the client —
 * a coach may be catching up after being away, so showing only the
 * newest would silently hide older undecided ones rather than being
 * honest that they're still awaiting a decision.
 */
export function ClientRecommendationsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const route = useRoute<RouteProp<ClientsStackParamList, "ClientRecommendations">>();
  const { userId, fullName } = route.params;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-client-recommendations", userId],
    queryFn: () => fetchClientRecommendations(userId),
  });

  const decideMutation = useMutation({
    mutationFn: (vars: { recommendationId: string; input: DecideRecommendationInput }) =>
      decideClientRecommendation(userId, vars.recommendationId, vars.input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-client-recommendations", userId] });
    },
    onError: (err) => Alert.alert("Couldn't save this decision", extractErrorMessage(err, "Please try again.")),
  });

  return (
    <ScreenContainer title={`${fullName}'s Recommendations`}>
      <Text onPress={() => navigation.goBack()} style={{ color: colors.accent, fontWeight: "600", marginBottom: spacing.xs }}>
        ‹ {fullName}
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          title={t("clients.recommendations.emptyTitle")}
          subtitle={t("clients.recommendations.emptySubtitle")}
        />
      )}

      {data && data.length > 0 && (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {data.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              isBusy={decideMutation.isPending && decideMutation.variables?.recommendationId === rec.id}
              onDecide={(input) => decideMutation.mutate({ recommendationId: rec.id, input })}
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

function RecommendationCard({
  recommendation,
  isBusy,
  onDecide,
}: {
  recommendation: Recommendation;
  isBusy: boolean;
  onDecide: (input: DecideRecommendationInput) => void;
}) {
  const { t } = useTranslation();
  const title =
    recommendation.kind === "no_change" ? "Continue Current Plan" : `Switch to ${recommendation.suggestedProgramName ?? "a new program"}`;

  return (
    <Card>
      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>{t("clients.recommendations.awaiting")}</Text>
      <Text style={{ color: colors.textPrimary, ...typography.h2, marginTop: 2 }}>{title}</Text>
      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: spacing.xs }}>{recommendation.rationale}</Text>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          label={recommendation.kind === "no_change" ? "Approve" : "Approve & Switch"}
          onPress={() => onDecide({ action: "accept" })}
          loading={isBusy}
          disabled={isBusy}
          style={{ flex: 1 }}
        />
        <Button
          label={t("clients.recommendations.reject")}
          variant="secondary"
          onPress={() => onDecide({ action: "decline" })}
          loading={isBusy}
          disabled={isBusy}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}
