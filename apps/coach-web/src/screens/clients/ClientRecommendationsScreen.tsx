import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import type { DecideRecommendationInput, Recommendation } from "@fitness-ai-app/types";
import { decideClientRecommendation, fetchClientProfile, fetchClientRecommendations } from "@/api/professionalClients";
import { EmptyState, ErrorState, ListSkeleton, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { extractErrorMessage } from "@/lib/apiError";
import { dateLabel } from "@/lib/format";

/**
 * Client Recommendations (Wave 2.4), ported from coach-mobile: every pending
 * AI plan recommendation for one client, with Approve / Reject
 * (decidedByRole "professional" server-side). All pending ones are listed,
 * not just the newest, so a coach catching up never misses an older one.
 * A `no_change` recommendation is a first-class positive outcome.
 */
export function ClientRecommendationsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { userId = "" } = useParams<{ userId: string }>();
  const location = useLocation();
  const stateName = (location.state as { fullName?: string } | null)?.fullName;

  // The name for the heading when this page is opened from its URL alone.
  // Same query (and cache) as Client Profile, so coming from there costs nothing.
  const profile = useQuery({
    queryKey: ["coach-client", userId],
    queryFn: () => fetchClientProfile(userId),
    enabled: userId.length > 0 && !stateName,
  });
  const fullName = stateName ?? profile.data?.fullName ?? t("web.clientProfile.clientFallback");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-client-recommendations", userId],
    queryFn: () => fetchClientRecommendations(userId),
    enabled: userId.length > 0,
  });

  const decideMutation = useMutation({
    mutationFn: (vars: { recommendationId: string; input: DecideRecommendationInput }) =>
      decideClientRecommendation(userId, vars.recommendationId, vars.input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["coach-client-recommendations", userId] });
    },
    onError: (err) =>
      toast.error(t("web.clientProfile.decideFailed"), { description: extractErrorMessage(err, t("web.clientProfile.tryAgain")) }),
  });

  return (
    <Page>
      <PageHeader back={{ to: `/clients/${userId}`, label: fullName }} title={t("web.clientProfile.recsTitle", { name: fullName })} />

      {isLoading ? <ListSkeleton rows={2} className="[&>*]:h-40" /> : null}
      {isError ? <ErrorState onRetry={() => refetch()} /> : null}

      {data && data.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={t("clients.recommendations.emptyTitle")}
          description={t("clients.recommendations.emptySubtitle")}
        />
      ) : null}

      {data && data.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              pendingAction={
                decideMutation.isPending && decideMutation.variables?.recommendationId === rec.id
                  ? decideMutation.variables.input.action
                  : null
              }
              onDecide={(input) => decideMutation.mutate({ recommendationId: rec.id, input })}
            />
          ))}
        </div>
      ) : null}
    </Page>
  );
}

function RecommendationCard({
  recommendation,
  pendingAction,
  onDecide,
}: {
  recommendation: Recommendation;
  pendingAction: DecideRecommendationInput["action"] | null;
  onDecide: (input: DecideRecommendationInput) => void;
}) {
  const { t } = useTranslation();
  const isBusy = pendingAction != null;
  const noChange = recommendation.kind === "no_change";
  const title = noChange
    ? t("web.clientProfile.continuePlan")
    : t("web.clientProfile.switchTo", { program: recommendation.suggestedProgramName ?? t("web.clientProfile.aNewProgram") });

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-primary-ink">{t("clients.recommendations.awaiting")}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{dateLabel(recommendation.createdAt)}</span>
        </div>
        <CardTitle className="font-heading text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground">{recommendation.rationale}</p>
      </CardContent>
      <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          className="h-10 w-full sm:h-8 sm:w-auto"
          onClick={() => onDecide({ action: "decline" })}
          disabled={isBusy}
        >
          {pendingAction === "decline" ? <Loader2 className="animate-spin" /> : <X />}
          {t("clients.recommendations.reject")}
        </Button>
        <Button className="h-10 w-full sm:h-8 sm:w-auto" onClick={() => onDecide({ action: "accept" })} disabled={isBusy}>
          {pendingAction === "accept" ? <Loader2 className="animate-spin" /> : <Check />}
          {noChange ? t("web.clientProfile.approve") : t("web.clientProfile.approveSwitch")}
        </Button>
      </CardFooter>
    </Card>
  );
}
