import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, Check, CircleCheckBig, CircleX, Loader2, Search } from "lucide-react";
import type { AvailableProfessional, CoachClientProfile } from "@fitness-ai-app/types";
import {
  completeRelationship,
  endRelationship,
  fetchAvailableProfessionalsForHandover,
  handoverRelationship,
} from "@/api/relationshipLifecycle";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/lib/apiError";
import { SERVICE_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * P-M11: `complete` sits beside end and handover. COMPLETED is distinct from
 * ENDED: ending says the arrangement stopped, completing says the work
 * finished. Both revoke access.
 */
type RelationshipMode = "end" | "handover" | "complete";

type Stage = "form" | "confirm";

/**
 * Complete / End / Handover for each relationship this coach has with the
 * client (a fitness and a nutrition relationship are separate pairings, so
 * ending one never ends the other). Same flow as the old app: a required
 * reason (and, for handover, an optional replacement coach), then a
 * confirmation, then the call. On success the parent leaves the screen.
 */
export function RelationshipActions({
  relationships,
  clientName,
  onComplete,
}: {
  relationships: CoachClientProfile["relationships"];
  clientName: string;
  onComplete: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [openRelationshipId, setOpenRelationshipId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [mode, setMode] = useState<RelationshipMode>("end");
  const [reason, setReason] = useState("");
  const [replacementSearch, setReplacementSearch] = useState("");
  const [replacementId, setReplacementId] = useState<string | null>(null);

  const availableProfessionalsQuery = useQuery({
    queryKey: ["coach-available-professionals-for-handover", replacementSearch],
    queryFn: () => fetchAvailableProfessionalsForHandover(replacementSearch || undefined),
    enabled: openRelationshipId != null && mode === "handover",
  });

  const resetForm = () => {
    setOpenRelationshipId(null);
    setStage("form");
    setReason("");
    setReplacementSearch("");
    setReplacementId(null);
  };

  const failure = (titleKey: string) => (err: unknown) =>
    toast.error(t(titleKey), { description: extractErrorMessage(err, t("web.clientProfile.tryAgain")) });

  const endMutation = useMutation({
    mutationFn: (relationshipId: string) => endRelationship(relationshipId, { reason: reason.trim() }),
    onSuccess: () => {
      resetForm();
      onComplete(t("web.clientProfile.ended"));
    },
    onError: failure("web.clientProfile.endFailed"),
  });

  const completeMutation = useMutation({
    mutationFn: (relationshipId: string) => completeRelationship(relationshipId, reason.trim()),
    onSuccess: () => {
      resetForm();
      onComplete(t("web.clientProfile.completed"));
    },
    onError: failure("web.clientProfile.completeFailed"),
  });

  const handoverMutation = useMutation({
    mutationFn: (relationshipId: string) =>
      handoverRelationship(relationshipId, {
        reason: reason.trim(),
        replacementProfessionalId: replacementId ?? undefined,
      }),
    onSuccess: (result) => {
      resetForm();
      onComplete(result.offer ? t("web.clientProfile.handedOver") : t("web.clientProfile.ended"));
    },
    onError: failure("web.clientProfile.handoverFailed"),
  });

  const isBusy = endMutation.isPending || handoverMutation.isPending || completeMutation.isPending;

  const openForm = (relationshipId: string, nextMode: RelationshipMode) => {
    resetForm();
    setOpenRelationshipId(relationshipId);
    setMode(nextMode);
  };

  const submit = () => {
    if (!openRelationshipId) return;
    if (mode === "handover") handoverMutation.mutate(openRelationshipId);
    else if (mode === "complete") completeMutation.mutate(openRelationshipId);
    else endMutation.mutate(openRelationshipId);
  };

  if (relationships.length === 0) return null;

  const open = relationships.find((r) => r.relationshipId === openRelationshipId) ?? null;
  const trimmedReason = reason.trim();
  const isHandoverWithReplacement = mode === "handover" && replacementId != null;
  const formTitle =
    mode === "handover"
      ? t("clients.profile.handover")
      : mode === "complete"
        ? t("clients.profile.completeProgramme")
        : t("clients.profile.endRelationship");
  const submitLabel =
    mode === "handover"
      ? t("web.clientProfile.handOver")
      : mode === "complete"
        ? t("web.clientProfile.completeCoaching")
        : t("web.clientProfile.endRelationship");
  const professionals = availableProfessionalsQuery.data?.professionals ?? [];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">{t("web.clientProfile.relationship")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {relationships.map((r) => (
          <div key={r.relationshipId} className="space-y-2">
            {relationships.length > 1 ? (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {SERVICE_SHORT[r.serviceType] ?? r.serviceType}
              </p>
            ) : null}
            <div className="grid gap-2">
              {/* Listed first because finishing a programme is the outcome
                  everyone wants; burying it behind the two ways things go
                  wrong makes it look like the exception. */}
              <Button className="h-10 w-full justify-start md:h-8" onClick={() => openForm(r.relationshipId, "complete")}>
                <CircleCheckBig />
                {t("clients.profile.completeProgramme")}
              </Button>
              <Button variant="outline" className="h-10 w-full justify-start md:h-8" onClick={() => openForm(r.relationshipId, "handover")}>
                <ArrowRightLeft />
                {t("clients.profile.handover")}
              </Button>
              <Button variant="destructive" className="h-10 w-full justify-start md:h-8" onClick={() => openForm(r.relationshipId, "end")}>
                <CircleX />
                {t("clients.profile.endRelationship")}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog
        open={open != null && stage === "form"}
        onOpenChange={(next) => {
          if (!next && !isBusy) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{formTitle}</DialogTitle>
            {open ? (
              <DialogDescription>
                {t("web.clientProfile.formService", { service: SERVICE_SHORT[open.serviceType] ?? open.serviceType, name: clientName })}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmedReason.length > 0 && !isBusy) setStage("confirm");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="relationship-reason">{t("web.clientProfile.reasonLabel")}</Label>
              <Textarea
                id="relationship-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("clients.profile.reasonRequired")}
                required
                className="min-h-20"
              />
            </div>

            {mode === "handover" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t("clients.profile.proposeReplacement")}</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={replacementSearch}
                    onChange={(e) => setReplacementSearch(e.target.value)}
                    placeholder={t("clients.profile.searchProfessionals")}
                    aria-label={t("clients.profile.searchProfessionals")}
                    className="h-10 pl-8 md:h-8"
                  />
                </div>
                {availableProfessionalsQuery.isLoading ? (
                  <div className="space-y-1.5" aria-busy="true">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : null}
                {professionals.length > 0 ? (
                  <div role="listbox" aria-label={t("clients.profile.proposeReplacement")} className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                    {professionals.map((p: AvailableProfessional) => {
                      const selected = p.id === replacementId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => setReplacementId(selected ? null : p.id)}
                          className={cn(
                            "flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                            selected && "bg-primary/10 font-medium",
                          )}
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center text-primary-ink">
                            {selected ? <Check className="size-4" /> : null}
                          </span>
                          <span className="flex-1">{p.fullName}</span>
                          {p.yearsExperience != null ? (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {t("web.clientProfile.yearsExp", { count: p.yearsExperience })}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {availableProfessionalsQuery.data?.professionals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("clients.profile.noProfessionalsAvailable")}</p>
                ) : null}
                {availableProfessionalsQuery.isError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {extractErrorMessage(availableProfessionalsQuery.error, t("common.checkConnection"))}
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={resetForm} disabled={isBusy}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant={mode === "end" ? "destructive" : "default"}
                className="h-10 sm:h-8"
                disabled={trimmedReason.length === 0 || isBusy}
              >
                {isBusy ? <Loader2 className="animate-spin" /> : null}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={open != null && stage === "confirm"}
        onOpenChange={(next) => {
          // Cancelling the confirmation goes back to the form, keeping the reason.
          if (!next && !isBusy) setStage("form");
        }}
        title={
          mode === "handover"
            ? t("web.clientProfile.confirmHandoverTitle")
            : mode === "complete"
              ? t("web.clientProfile.confirmCompleteTitle")
              : t("web.clientProfile.confirmEndTitle")
        }
        description={
          isHandoverWithReplacement
            ? t("web.clientProfile.confirmHandoverReplacement")
            : mode === "complete"
              ? t("web.clientProfile.confirmComplete")
              : t("web.clientProfile.confirmEnd")
        }
        confirmLabel={
          mode === "handover"
            ? t("web.clientProfile.handOver")
            : mode === "complete"
              ? t("web.clientProfile.complete")
              : t("web.clientProfile.endRelationship")
        }
        onConfirm={submit}
        // Completing is the good ending; styling it red would tell a coach
        // finishing a programme well that they are doing damage.
        destructive={mode !== "complete"}
        pending={isBusy}
      />
    </Card>
  );
}
