import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, IdCard, Info, Upload } from "lucide-react";
import type { ProfessionalCredential } from "@fitness-ai-app/types";
import { fetchOnboardingStatus } from "@/api/professionalOnboarding";
import { ErrorState, ListCard, ListSkeleton, Page, PageHeader } from "@/components/page";
import { CoachAvatar } from "@/components/shell/AccountMenu";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";
import { dateLabel, SERVICE_LABELS } from "@/lib/format";
import { OnboardingLayout, useIsOnboarding, wizardPaths } from "./OnboardingLayout";

/**
 * Verification status, ported from apps/coach-mobile's
 * VerificationStatusScreen. At /onboarding/status it ends onboarding:
 * "Go to Dashboard" calls markOnboardingCompleted() (and only then, so the
 * coach sees this page first). At /verification, inside the app, it offers
 * "Upload documents again" for anything not verified yet. A rejected item
 * shows the reviewer's note and an expiry date shows when set.
 */
export function VerificationStatusScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isOnboarding = useIsOnboarding();
  const { professional, markOnboardingCompleted } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["professional-onboarding-status"],
    queryFn: fetchOnboardingStatus,
  });
  const services = (data?.credentials ?? []).map((c) => c.serviceType);
  // A new upload sets that item back to Pending, so only offer the ones that
  // aren't verified: a coach can't lose a verified status by accident here.
  const toFix = (data?.credentials ?? []).filter((c) => c.status !== "verified").map((c) => c.serviceType);
  const kycToFix = !!data && data.kycStatus !== "verified";
  const needsUpload = toFix.length > 0 || kycToFix;
  const paths = wizardPaths(false);
  const uploadAgain = () => {
    if (toFix.length > 0) navigate(paths.credentials(toFix, 0));
    else navigate(paths.kyc(services));
  };
  const goToDashboard = () => {
    markOnboardingCompleted();
    navigate("/", { replace: true });
  };

  const body = (
    <div className="space-y-4">
      {isLoading ? <ListSkeleton rows={3} /> : null}
      {isError ? <ErrorState onRetry={() => refetch()} /> : null}
      {data ? (
        <>
          <ListCard>
            {data.credentials.map((c) => (
              <CredentialRow key={c.id} credential={c} />
            ))}
            <div className="flex items-start gap-3 px-4 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <IdCard className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{t("onboarding.verification.identity")}</p>
                  <StatusBadge status={data.kycStatus} />
                </div>
                {data.kycStatus === "rejected" ? <p className="text-sm text-destructive">{t("onboarding.verification.rejected")}</p> : null}
              </div>
            </div>
          </ListCard>

          <div className="flex gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>{t("onboarding.verification.howItWorks")}</p>
          </div>
        </>
      ) : null}
    </div>
  );

  if (isOnboarding) {
    return (
      <OnboardingLayout
        footer={
          <Button size="lg" className="h-10 w-full sm:ml-auto sm:w-auto sm:px-5" onClick={goToDashboard}>
            {t("onboarding.verification.goToDashboard")}
            <ArrowRight />
          </Button>
        }
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-heading text-2xl font-bold tracking-tight md:text-[28px]">{t("onboarding.verification.title")}</h1>
            <Identity name={professional?.fullName} email={professional?.email} />
          </div>
          {body}
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader
        title={t("onboarding.verification.title")}
        description={t("more.verification.subtitle")}
        back={isMobile ? { to: "/more", label: t("web.nav.more") } : undefined}
        actions={
          needsUpload ? (
            <Button variant="outline" className="hidden h-9 sm:inline-flex" onClick={uploadAgain}>
              <Upload />
              {t("onboarding.verification.uploadAgain")}
            </Button>
          ) : null
        }
      />
      <Identity name={professional?.fullName} email={professional?.email} />
      {body}
      {needsUpload ? (
        <div className="space-y-2">
          <Button variant="outline" size="lg" className="h-10 w-full sm:hidden" onClick={uploadAgain}>
            <Upload />
            {t("onboarding.verification.uploadAgain")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("onboarding.verification.uploadHint")}</p>
        </div>
      ) : null}
    </Page>
  );
}

function Identity({ name, email }: { name?: string; email?: string }) {
  return (
    <div className="flex items-center gap-3">
      <CoachAvatar className="size-10 rounded-full" />
      <div className="min-w-0">
        <p className="truncate font-semibold">{name}</p>
        <p className="truncate text-sm text-muted-foreground">{email}</p>
      </div>
    </div>
  );
}

function CredentialRow({ credential: c }: { credential: ProfessionalCredential }) {
  const { t } = useTranslation();
  const details = [c.certificationName, c.certifyingBody, c.yearObtained ? String(c.yearObtained) : null].filter(Boolean).join(" · ");
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
        {SERVICE_LABELS[c.serviceType]?.[0] ?? "?"}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{SERVICE_LABELS[c.serviceType] ?? c.serviceType}</p>
          <StatusBadge status={c.status} />
        </div>
        {details ? <p className="text-sm text-muted-foreground">{details}</p> : null}
        {c.status === "rejected" ? (
          <p className="text-sm text-destructive">
            {t("onboarding.verification.rejected")}
            {c.adminNotes ? ` ${t("onboarding.verification.rejectedReason", { reason: c.adminNotes })}` : ""}
          </p>
        ) : null}
        {c.expiresAt ? (
          <p className="text-sm text-muted-foreground">
            {t("onboarding.verification.expires", { date: dateLabel(c.expiresAt, { day: "numeric", month: "short", year: "numeric" }) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
