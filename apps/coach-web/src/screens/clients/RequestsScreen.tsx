import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Clock, History, Inbox, Loader2, Sparkles, X } from "lucide-react";
import type { PendingRelationshipItem, ProfessionalOfferForCoach } from "@fitness-ai-app/types";
import {
  acceptRelationshipRequest,
  declineRelationshipRequest,
  fetchPendingRelationships,
} from "@/api/relationshipRequests";
import {
  acceptProfessionalOffer,
  declineProfessionalOffer,
  fetchProfessionalOffers,
} from "@/api/professionalOffers";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton, Page, PageHeader, Section } from "@/components/page";
import { initials } from "@/components/shell/AccountMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { extractErrorCode, extractErrorMessage } from "@/lib/apiError";
import { dateLabel, dateTimeLabel, SERVICE_SHORT } from "@/lib/format";

/** The member's time to pay after an accept: the API's PAYMENT_WINDOW_MS (lib/relationshipActivation.ts). */
const PAYMENT_WINDOW_HOURS = 48;

/**
 * Same 72-hour "stalled" threshold as apps/api's professionalOffers.service.ts
 * #STALLED_OFFER_THRESHOLD_MS, so this note and the admin queue's
 * `professional_acceptance_stalled` item agree. Informational only.
 */
const STALLED_OFFER_THRESHOLD_MS = 72 * 60 * 60 * 1000;

function isStalled(createdAtIso: string): boolean {
  return Date.now() - new Date(createdAtIso).getTime() >= STALLED_OFFER_THRESHOLD_MS;
}

function shortDay(iso: string): string {
  return dateLabel(iso, { day: "numeric", month: "short" });
}

/** The member's preferred start day. Stored at UTC midnight, so read in UTC to avoid sliding a day. */
function preferredDayLabel(iso: string): string {
  return dateLabel(iso, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

type DeclineTarget = { kind: "request"; item: PendingRelationshipItem } | { kind: "offer"; item: ProfessionalOfferForCoach };

/**
 * Requests & offers, ported from apps/coach-mobile's PendingRequestsScreen.
 * Two distinct flows kept as two sections: Client Requests (a Relationship a
 * member already asked for, POST /professionals/me/relationships/:id/
 * accept|decline) and Offers from Fynrox (a ProfessionalOffer that only
 * becomes a Relationship once accepted). Same queries, mutations and
 * invalidations as the old screen; decline asks first, and a request that
 * sat past its reply window (409 `relationship_expired`) is said plainly on
 * the page and dropped from the list.
 */
export function RequestsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fallback = t("web.clients.tryAgain");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-pending-requests"],
    queryFn: fetchPendingRelationships,
  });

  const offersQuery = useQuery({
    queryKey: ["coach-professional-offers"],
    // Wrapped: fetchProfessionalOffers takes an optional status filter, and
    // React Query would otherwise hand it the query context.
    queryFn: () => fetchProfessionalOffers("offered"),
  });

  // `coach-alerts` is the shell's badge count, so it drops as soon as the coach answers.
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

  const [expiredRequest, setExpiredRequest] = useState<PendingRelationshipItem | null>(null);
  const [declineTarget, setDeclineTarget] = useState<DeclineTarget | null>(null);

  const onRequestError = (title: string) => (err: unknown, item: PendingRelationshipItem) => {
    if (extractErrorCode(err) === "relationship_expired") {
      setExpiredRequest(item);
      invalidateAfterAction();
      return;
    }
    toast.error(title, { description: extractErrorMessage(err, fallback) });
  };

  const acceptMutation = useMutation({
    mutationFn: (item: PendingRelationshipItem) => acceptRelationshipRequest(item.relationshipId),
    onMutate: () => setExpiredRequest(null),
    onSuccess: (_data, item) => {
      invalidateAfterAction();
      // A next step instead of a card that just vanishes. Chat opens once they pay.
      toast.success(t("web.clients.acceptedTitle"), {
        description: t("web.clients.acceptedBody", { name: item.userFullName.split(" ")[0], hours: PAYMENT_WINDOW_HOURS }),
        duration: 10_000,
      });
    },
    onError: onRequestError(t("web.clients.acceptFailed")),
  });

  const declineMutation = useMutation({
    mutationFn: (item: PendingRelationshipItem) => declineRelationshipRequest(item.relationshipId),
    onMutate: () => setExpiredRequest(null),
    onSuccess: () => {
      invalidateAfterAction();
      toast.success(t("web.clients.requestDeclined"));
    },
    onError: onRequestError(t("web.clients.declineFailed")),
  });

  const acceptOfferMutation = useMutation({
    mutationFn: (offerId: string) => acceptProfessionalOffer(offerId),
    onSuccess: () => {
      invalidateAfterOfferAction();
      toast.success(t("web.clients.offerAccepted"));
    },
    onError: (err) => toast.error(t("web.clients.acceptOfferFailed"), { description: extractErrorMessage(err, fallback) }),
  });

  const declineOfferMutation = useMutation({
    mutationFn: (offerId: string) => declineProfessionalOffer(offerId),
    onSuccess: () => {
      invalidateAfterOfferAction();
      toast.success(t("web.clients.offerDeclined"));
    },
    onError: (err) => toast.error(t("web.clients.declineOfferFailed"), { description: extractErrorMessage(err, fallback) }),
  });

  const confirmDecline = () => {
    if (!declineTarget) return;
    const close = { onSettled: () => setDeclineTarget(null) };
    if (declineTarget.kind === "request") declineMutation.mutate(declineTarget.item, close);
    else declineOfferMutation.mutate(declineTarget.item.offerId, close);
  };

  const requests = data?.requests ?? [];
  const offers = offersQuery.data?.offers ?? [];

  return (
    <Page width="wide">
      <PageHeader
        title={t("web.nav.requests")}
        description={t("web.clients.requestsDescription")}
        back={{ to: "/clients", label: t("web.clients.backToClients") }}
      />

      {expiredRequest ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold">{t("clients.pending.expiredTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("clients.pending.expiredBody", { name: expiredRequest.userFullName })}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => setExpiredRequest(null)} aria-label={t("clients.pending.dismiss")}>
            <X />
          </Button>
        </div>
      ) : null}

      <Section title={t("clients.pending.requests")} description={t("clients.pending.requestsNote")}>
        {isLoading ? <ListSkeleton rows={2} /> : null}
        {isError ? <ErrorState onRetry={() => refetch()} /> : null}
        {data && requests.length === 0 ? (
          <EmptyState icon={Inbox} title={t("clients.pending.emptyTitle")} description={t("clients.pending.emptySubtitle")} />
        ) : null}
        {requests.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {requests.map((item) => {
              const accepting = acceptMutation.isPending && acceptMutation.variables?.relationshipId === item.relationshipId;
              const declining = declineMutation.isPending && declineMutation.variables?.relationshipId === item.relationshipId;
              return (
                <RequestCard
                  key={item.relationshipId}
                  name={item.userFullName}
                  subtitle={t("web.clients.requestedOn", {
                    service: SERVICE_SHORT[item.serviceType] ?? item.serviceType,
                    date: shortDay(item.requestedAt ?? item.createdAt),
                  })}
                  accepting={accepting}
                  declining={declining}
                  onAccept={() => acceptMutation.mutate(item)}
                  onDecline={() => setDeclineTarget({ kind: "request", item })}
                >
                  <RequestDetails item={item} />
                </RequestCard>
              );
            })}
          </div>
        ) : null}
      </Section>

      <Section
        title={t("clients.pending.offers")}
        description={t("clients.pending.offerNote")}
        actions={
          <Button variant="ghost" size="sm" className="shrink-0 text-primary-ink" render={<Link to="/clients/offers" />}>
            <History />
            {t("web.clients.offerHistory")}
          </Button>
        }
      >
        {offersQuery.isLoading ? <ListSkeleton rows={2} /> : null}
        {offersQuery.isError ? <ErrorState onRetry={() => offersQuery.refetch()} /> : null}
        {offersQuery.data && offers.length === 0 ? (
          <EmptyState icon={Sparkles} title={t("clients.pending.offersEmptyTitle")} description={t("clients.pending.offersEmptySubtitle")} />
        ) : null}
        {offers.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {offers.map((item) => {
              const accepting = acceptOfferMutation.isPending && acceptOfferMutation.variables === item.offerId;
              const declining = declineOfferMutation.isPending && declineOfferMutation.variables === item.offerId;
              const proposed = t("web.clients.proposedOn", {
                service: SERVICE_SHORT[item.serviceType] ?? item.serviceType,
                date: shortDay(item.createdAt),
              });
              return (
                <RequestCard
                  key={item.offerId}
                  name={item.userFullName}
                  subtitle={item.expiresAt ? `${proposed} · ${t("web.clients.expiresOn", { date: shortDay(item.expiresAt) })}` : proposed}
                  accepting={accepting}
                  declining={declining}
                  onAccept={() => acceptOfferMutation.mutate(item.offerId)}
                  onDecline={() => setDeclineTarget({ kind: "offer", item })}
                >
                  {isStalled(item.createdAt) ? (
                    <p className="flex items-start gap-1.5 text-sm text-warning">
                      <Clock className="mt-0.5 size-3.5 shrink-0" />
                      {t("clients.pending.notResponded")}
                    </p>
                  ) : null}
                </RequestCard>
              );
            })}
          </div>
        ) : null}
      </Section>

      <ConfirmDialog
        open={declineTarget !== null}
        onOpenChange={(open) => {
          if (!open && !declineMutation.isPending && !declineOfferMutation.isPending) setDeclineTarget(null);
        }}
        title={declineTarget?.kind === "offer" ? t("web.clients.declineOfferTitle") : t("web.clients.declineRequestTitle")}
        description={
          declineTarget
            ? declineTarget.kind === "offer"
              ? t("web.clients.declineOfferBody", { name: declineTarget.item.userFullName })
              : t("web.clients.declineRequestBody", { name: declineTarget.item.userFullName })
            : undefined
        }
        confirmLabel={t("common.decline")}
        destructive
        pending={declineMutation.isPending || declineOfferMutation.isPending}
        onConfirm={confirmDecline}
      />
    </Page>
  );
}

function RequestCard({
  name,
  subtitle,
  accepting,
  declining,
  onAccept,
  onDecline,
  children,
}: {
  name: string;
  subtitle: string;
  accepting: boolean;
  declining: boolean;
  onAccept: () => void;
  onDecline: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const busy = accepting || declining;
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            <AvatarFallback className="font-medium">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-heading text-base font-semibold">{name}</span>
            <span className="truncate text-sm text-muted-foreground">{subtitle}</span>
          </div>
        </div>
        {children}
        <div className="mt-auto flex gap-2 pt-1">
          <Button size="lg" className="h-10 flex-1 md:h-9" onClick={onAccept} disabled={busy}>
            {accepting ? <Loader2 className="animate-spin" /> : null}
            {t("common.accept")}
          </Button>
          <Button size="lg" variant="outline" className="h-10 flex-1 md:h-9" onClick={onDecline} disabled={busy}>
            {declining ? <Loader2 className="animate-spin" /> : null}
            {t("common.decline")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** What the member asked for: the service, a preferred day, a note, and when the reply window closes. */
function RequestDetails({ item }: { item: PendingRelationshipItem }) {
  const { t } = useTranslation();
  // A request made before 25 Oct carries none of these; "Any day" would then claim a preference nobody stated.
  const hasDetails = !!(item.serviceName || item.preferredDate || item.note);
  return (
    <>
      {hasDetails ? (
        <div className="space-y-2">
          <dl className="space-y-1 text-sm">
            {item.serviceName ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("clients.pending.askedFor")}</dt>
                <dd className="text-right font-medium">{item.serviceName}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("clients.pending.preferredDay")}</dt>
              <dd className="text-right font-medium">
                {item.preferredDate ? preferredDayLabel(item.preferredDate) : t("clients.pending.anyDay")}
              </dd>
            </div>
          </dl>
          {item.note ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t("clients.pending.note")}</p>
              <p className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{item.note}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {item.replyBy ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
          <Clock className="size-3.5 shrink-0" />
          {t("clients.pending.replyBy", { when: dateTimeLabel(item.replyBy) })}
        </p>
      ) : null}
    </>
  );
}
