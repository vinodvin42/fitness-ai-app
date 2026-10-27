import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Loader2, Sparkles } from "lucide-react";
import type { ProfessionalOfferForCoach } from "@fitness-ai-app/types";
import { acceptProfessionalOffer, declineProfessionalOffer, fetchProfessionalOffers } from "@/api/professionalOffers";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, ErrorState, ListSkeleton, Page, PageHeader } from "@/components/page";
import { StatusBadge } from "@/components/StatusBadge";
import { initials } from "@/components/shell/AccountMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { dateLabel, SERVICE_SHORT } from "@/lib/format";

type Filter = "offered" | "declined" | "expired" | "accepted";

const FILTERS: Array<{ value: Filter; labelKey: string }> = [
  { value: "offered", labelKey: "web.clients.filterOffered" },
  { value: "accepted", labelKey: "web.clients.filterAccepted" },
  { value: "declined", labelKey: "web.clients.filterDeclined" },
  { value: "expired", labelKey: "web.clients.filterExpired" },
];

const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  offered: { title: "web.clients.emptyOfferedTitle", body: "web.clients.emptyOfferedBody" },
  accepted: { title: "web.clients.emptyAcceptedTitle", body: "web.clients.emptyAcceptedBody" },
  declined: { title: "web.clients.emptyDeclinedTitle", body: "web.clients.emptyDeclinedBody" },
  expired: { title: "web.clients.emptyExpiredTitle", body: "web.clients.emptyExpiredBody" },
};

function hoursLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3_600_000));
}

/**
 * Offers, ported from apps/coach-mobile's OffersScreen (P-M7): every offer
 * Fynrox has made this professional, filtered by status, so a declined or
 * expired offer leaves a record. Declining asks for a reason but does not
 * require one: demanding it would push people toward letting the offer
 * expire, the worst outcome for the waiting client.
 */
export function OffersScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("offered");
  const [declining, setDeclining] = useState<ProfessionalOfferForCoach | null>(null);
  const [reason, setReason] = useState("");

  const offers = useQuery({
    queryKey: ["professionalOffers", filter],
    queryFn: () => fetchProfessionalOffers(filter),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["professionalOffers"] });
    queryClient.invalidateQueries({ queryKey: ["professionalDashboard"] });
    // Requests & offers' list and the shell's badge.
    queryClient.invalidateQueries({ queryKey: ["coach-professional-offers"] });
    queryClient.invalidateQueries({ queryKey: ["coach-alerts"] });
  };

  const accept = useMutation({
    mutationFn: (offerId: string) => acceptProfessionalOffer(offerId),
    onSuccess: () => {
      invalidate();
      toast.success(t("web.clients.offerAccepted"));
    },
    onError: () => toast.error(t("web.clients.offerAcceptFailedTitle"), { description: t("web.clients.offerAcceptFailedBody") }),
  });

  const decline = useMutation({
    mutationFn: (offerId: string) => declineProfessionalOffer(offerId, reason.trim() ? { reason: reason.trim() } : {}),
    onSuccess: () => {
      setDeclining(null);
      setReason("");
      invalidate();
      toast.success(t("web.clients.offerDeclined"));
    },
    onError: () => toast.error(t("web.clients.offerDeclineFailedTitle"), { description: t("web.clients.offerDeclineFailedBody") }),
  });

  const closeDecline = () => {
    setDeclining(null);
    setReason("");
  };

  const rows = offers.data?.offers ?? [];

  return (
    <Page>
      <PageHeader
        title={t("clients.offers.title")}
        description={t("clients.offers.intro")}
        back={{ to: "/clients/requests", label: t("web.clients.offersBack") }}
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList aria-label={t("web.clients.filterLabel")} className="w-full sm:w-fit">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="px-3">
              {t(f.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {offers.isLoading ? <ListSkeleton rows={3} /> : null}
      {offers.isError ? <ErrorState onRetry={() => offers.refetch()} /> : null}

      {offers.data && rows.length === 0 ? (
        <EmptyState icon={Sparkles} title={t(EMPTY_COPY[filter].title)} description={t(EMPTY_COPY[filter].body)} />
      ) : null}

      {rows.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((o) => {
            const left = hoursLeft(o.expiresAt);
            const accepting = accept.isPending && accept.variables === o.offerId;
            return (
              <Card key={o.offerId}>
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <Avatar size="lg">
                      <AvatarFallback className="font-medium">{initials(o.userFullName)}</AvatarFallback>
                    </Avatar>
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-heading text-base font-semibold">{o.userFullName}</span>
                      <span className="truncate text-sm text-muted-foreground">
                        {SERVICE_SHORT[o.serviceType] ?? o.serviceType} ·{" "}
                        {dateLabel(o.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <StatusBadge status={o.status} label={o.status === "accepted" ? t("web.clients.accepted") : undefined} />
                  </div>

                  {/* The countdown is the client's wait, not the coach's deadline: framed that way on purpose. */}
                  {o.status === "offered" && left != null ? (
                    <p className={cn("flex items-start gap-1.5 text-sm", left <= 6 ? "text-warning" : "text-muted-foreground")}>
                      <Clock className="mt-0.5 size-3.5 shrink-0" />
                      {left === 0 ? t("web.clients.expiringNow") : t("web.clients.hoursLeft", { count: left })}
                    </p>
                  ) : null}

                  {o.status === "expired" ? <p className="text-sm text-muted-foreground">{t("clients.offers.returned")}</p> : null}

                  {o.status === "offered" ? (
                    <div className="mt-auto flex gap-2 pt-1">
                      <Button size="lg" className="h-10 flex-1 md:h-9" onClick={() => accept.mutate(o.offerId)} disabled={accepting}>
                        {accepting ? <Loader2 className="animate-spin" /> : null}
                        {t("common.accept")}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-10 flex-1 md:h-9"
                        onClick={() => setDeclining(o)}
                        disabled={accepting}
                      >
                        {t("common.decline")}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <ConfirmDialog
        open={declining !== null}
        onOpenChange={(open) => {
          if (!open && !decline.isPending) closeDecline();
        }}
        title={t("web.clients.declineOfferTitle")}
        description={declining ? t("web.clients.noReasonTold", { name: declining.userFullName.split(" ")[0] }) : undefined}
        confirmLabel={t("clients.offers.confirmDecline")}
        destructive
        pending={decline.isPending}
        onConfirm={() => declining && decline.mutate(declining.offerId)}
      >
        <div className="space-y-2">
          <Label htmlFor="offer-decline-reason">{t("clients.offers.whyDeclining")}</Label>
          <Textarea
            id="offer-decline-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t("clients.offers.reasonPlaceholder")}
            disabled={decline.isPending}
          />
        </div>
      </ConfirmDialog>
    </Page>
  );
}
