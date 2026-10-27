import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Minus, Plus } from "lucide-react";
import { fetchLifecycleSummary, updateMyCapacity } from "@/api/professionalLifecycle";
import { fetchOnboardingStatus } from "@/api/professionalOnboarding";
import { ErrorState, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { extractErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 500;

const LIFECYCLE_STAGES = ["application", "verification", "approved", "available", "suspended"] as const;

const LIFECYCLE_TONES: Record<string, string> = {
  application: "bg-muted text-muted-foreground",
  verification: "bg-warning/15 text-warning",
  approved: "bg-warning/15 text-warning",
  available: "bg-success/15 text-success",
  suspended: "bg-destructive/12 text-destructive",
};

/**
 * Availability & Capacity, ported from apps/coach-mobile's
 * more/AvailabilityScreen (R2 Wave 2). Reads the lifecycle summary and the
 * onboarding status (for the "X of Y services verified" line while approved
 * but not yet open), and edits the client cap.
 */
export function AvailabilityScreen() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [draftCapacity, setDraftCapacity] = useState("");

  const lifecycleQuery = useQuery({ queryKey: ["coach-lifecycle"], queryFn: fetchLifecycleSummary });
  const onboardingQuery = useQuery({ queryKey: ["coach-onboarding-status"], queryFn: fetchOnboardingStatus });

  useEffect(() => {
    if (lifecycleQuery.data) setDraftCapacity(String(lifecycleQuery.data.maxActiveClients));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycleQuery.data?.maxActiveClients]);

  const saveMutation = useMutation({
    mutationFn: (maxActiveClients: number) => updateMyCapacity({ maxActiveClients }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-lifecycle"] });
      toast.success(t("web.business.availability.saved"), { description: t("web.business.availability.savedBody") });
    },
    onError: (err) =>
      toast.error(t("web.business.availability.saveFailed"), {
        description: extractErrorMessage(err, t("web.business.availability.tryAgain")),
      }),
  });

  const summary = lifecycleQuery.data;
  const parsedCapacity = Number.parseInt(draftCapacity, 10);
  const isValidCapacity = Number.isInteger(parsedCapacity) && parsedCapacity >= MIN_CAPACITY && parsedCapacity <= MAX_CAPACITY;
  const isDirty = summary != null && isValidCapacity && parsedCapacity !== summary.maxActiveClients;

  const adjustCapacity = (delta: number) => {
    const base = Number.isInteger(parsedCapacity) ? parsedCapacity : (summary?.maxActiveClients ?? MIN_CAPACITY);
    setDraftCapacity(String(Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, base + delta))));
  };

  const verifiedCount = onboardingQuery.data?.credentials.filter((c) => c.status === "verified").length ?? 0;
  const totalCredentials = onboardingQuery.data?.credentials.length ?? 0;

  const precondition = (() => {
    if (!summary) return null;
    switch (summary.lifecycleStatus) {
      case "application":
        return t("availabilityStatus.stage.application");
      case "verification":
        return t("availabilityStatus.stage.verification");
      case "approved":
        return totalCredentials > 0
          ? t("availabilityStatus.stage.approvedWithCredentials", { verified: verifiedCount, total: totalCredentials })
          : t("availabilityStatus.stage.approved");
      case "available":
        return t("availabilityStatus.stage.available");
      case "suspended":
        return t("availabilityStatus.stage.suspended");
      default:
        return null;
    }
  })();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isDirty && !saveMutation.isPending) saveMutation.mutate(parsedCapacity);
  };

  const loading = lifecycleQuery.isLoading || onboardingQuery.isLoading;
  const stageLabel = (s: string) =>
    (LIFECYCLE_STAGES as readonly string[]).includes(s) ? t(`web.business.availability.lifecycleLabel.${s}`) : s;
  const showInvalid = !isValidCapacity && draftCapacity.length > 0;

  return (
    <Page>
      <PageHeader
        title={t("availability.title")}
        description={t("more.availability.subtitle")}
        back={isMobile ? { to: "/more", label: t("web.nav.more") } : undefined}
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-48 rounded-xl md:col-span-2" />
        </div>
      ) : null}

      {lifecycleQuery.isError ? (
        <ErrorState
          message={extractErrorMessage(lifecycleQuery.error, t("web.business.availability.loadError"))}
          onRetry={() => lifecycleQuery.refetch()}
        />
      ) : null}

      {summary && !loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardDescription className="text-xs font-medium tracking-wide uppercase">{t("availabilityStatus.lifecycle")}</CardDescription>
              <div>
                <span
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
                    LIFECYCLE_TONES[summary.lifecycleStatus] ?? LIFECYCLE_TONES.application,
                  )}
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {stageLabel(summary.lifecycleStatus)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {precondition ? <p className="text-muted-foreground">{precondition}</p> : null}
              {summary.status === "suspended" && summary.lifecycleStatus !== "suspended" ? (
                <p role="alert" className="text-destructive">
                  {t("availabilityStatus.suspendedOverride")}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription className="text-xs font-medium tracking-wide uppercase">{t("availabilityStatus.activeClients")}</CardDescription>
              <p className="font-heading text-3xl font-bold tabular-nums">
                {t("web.business.availability.activeOfMax", { active: summary.activeClients, max: summary.maxActiveClients })}
              </p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Progress
                value={summary.maxActiveClients > 0 ? Math.min(100, (summary.activeClients / summary.maxActiveClients) * 100) : 0}
                aria-label={t("availabilityStatus.activeClients")}
              />
              <p className="text-muted-foreground">
                {summary.isAvailableForNewClients
                  ? t("web.business.availability.roomForMore")
                  : summary.lifecycleStatus === "available"
                    ? t("web.business.availability.atCapacity")
                    : t("web.business.availability.needsAvailable")}
              </p>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <CardHeader>
                <CardTitle className="font-semibold">
                  <label htmlFor="max-active-clients">{t("availabilityStatus.maxActiveClients")}</label>
                </CardTitle>
                <CardDescription>
                  {t("web.business.availability.capacityHelp", { min: MIN_CAPACITY, max: MAX_CAPACITY })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 sm:max-w-xs">
                  <Button
                    type="button"
                    variant="outline"
                    className="size-11 shrink-0"
                    aria-label={t("web.business.availability.decrease")}
                    onClick={() => adjustCapacity(-1)}
                    disabled={saveMutation.isPending || (Number.isInteger(parsedCapacity) && parsedCapacity <= MIN_CAPACITY)}
                  >
                    <Minus />
                  </Button>
                  <Input
                    id="max-active-clients"
                    inputMode="numeric"
                    autoComplete="off"
                    value={draftCapacity}
                    onChange={(e) => setDraftCapacity(e.target.value.replace(/[^0-9]/g, ""))}
                    disabled={saveMutation.isPending}
                    aria-invalid={showInvalid || undefined}
                    aria-describedby={showInvalid ? "capacity-error" : undefined}
                    className="h-11 flex-1 text-center font-heading text-xl font-bold tabular-nums md:text-xl"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="size-11 shrink-0"
                    aria-label={t("web.business.availability.increase")}
                    onClick={() => adjustCapacity(1)}
                    disabled={saveMutation.isPending || (Number.isInteger(parsedCapacity) && parsedCapacity >= MAX_CAPACITY)}
                  >
                    <Plus />
                  </Button>
                </div>
                {showInvalid ? (
                  <p id="capacity-error" role="alert" className="text-sm text-destructive">
                    {t("web.business.availability.capacityInvalid", { min: MIN_CAPACITY, max: MAX_CAPACITY })}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button type="submit" size="lg" className="h-10 w-full sm:w-auto sm:px-5" disabled={!isDirty || saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                    {t("common.save")}
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      ) : null}
    </Page>
  );
}
