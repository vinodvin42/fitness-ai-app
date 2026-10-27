import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { fetchOnboardingStatus, submitCredential } from "@/api/professionalOnboarding";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractErrorMessage } from "@/lib/apiError";
import { SERVICE_LABELS } from "@/lib/format";
import {
  DocumentPicker,
  parseServices,
  useGoBack,
  useIsOnboarding,
  WizardFrame,
  wizardPaths,
  type PickedDocument,
} from "./OnboardingLayout";

/**
 * Onboarding step 2, ported from apps/coach-mobile's CredentialUploadScreen:
 * certification name, body and year plus two document slots, once per
 * selected service (`?services=…&index=n`). Also reached from Verification
 * (`/verification/credentials`), where a coach whose ID is already verified
 * skips the KYC step.
 */
export function CredentialUploadScreen() {
  const { t } = useTranslation();
  const isOnboarding = useIsOnboarding();
  const [params] = useSearchParams();
  const services = parseServices(params.get("services"));
  const rawIndex = Number.parseInt(params.get("index") ?? "0", 10);
  const index = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < services.length ? rawIndex : 0;

  if (services.length === 0) {
    if (isOnboarding) return <Navigate to="/onboarding" replace />;
    return (
      <Page width="narrow">
        <EmptyState
          icon={BadgeCheck}
          title={t("web.settings.onboarding.noServicesTitle")}
          description={t("web.settings.onboarding.noServicesBody")}
          action={
            <Button variant="outline" render={<Link to="/verification" />}>
              {t("web.nav.verification")}
            </Button>
          }
        />
      </Page>
    );
  }
  // A fresh form per service, like the old app's navigation.replace.
  return <CredentialForm key={`${services.join(",")}-${index}`} services={services} index={index} isOnboarding={isOnboarding} />;
}

function CredentialForm({ services, index, isOnboarding }: { services: ProfessionalServiceType[]; index: number; isOnboarding: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const goBack = useGoBack("/verification");
  const paths = wizardPaths(isOnboarding);
  const serviceType = services[index];
  // Same key the Verification screen reads, so it is usually already cached;
  // fetched here too so a coach who opened this page from a link still skips
  // a KYC step that's already verified.
  const status = useQuery({ queryKey: ["professional-onboarding-status"], queryFn: fetchOnboardingStatus, enabled: !isOnboarding });
  const kycVerified = status.data?.kycStatus === "verified";

  const [certificationName, setCertificationName] = useState("");
  const [certifyingBody, setCertifyingBody] = useState("");
  const [yearObtained, setYearObtained] = useState("");
  const [certificationDoc, setCertificationDoc] = useState<PickedDocument | null>(null);
  const [qualificationDoc, setQualificationDoc] = useState<PickedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    setError(null);
    setLoading(true);
    try {
      await submitCredential({
        serviceType,
        certificationName: certificationName.trim() || undefined,
        certifyingBody: certifyingBody.trim() || undefined,
        yearObtained: yearObtained.trim() ? Number(yearObtained.trim()) : undefined,
        certificationDocData: certificationDoc?.dataUri ?? undefined,
        qualificationDocData: qualificationDoc?.dataUri ?? undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["professional-onboarding-status"] });
      const nextIndex = index + 1;
      if (nextIndex < services.length) {
        navigate(paths.credentials(services, nextIndex), { replace: true });
      } else if (!isOnboarding && kycVerified) {
        // From Verification: an ID that's already verified doesn't need uploading again.
        navigate("/verification");
      } else {
        navigate(paths.kyc(services));
      }
    } catch (err) {
      setError(extractErrorMessage(err, t("web.settings.onboarding.submitCredentialFailed")));
      setLoading(false);
    }
  };

  return (
    <WizardFrame
      step={2}
      total={3}
      label={t("web.settings.onboarding.credentialsStep", { index: index + 1, count: services.length })}
      title={t("web.settings.onboarding.credentialsTitle", { service: SERVICE_LABELS[serviceType] })}
      subtitle={t("onboarding.credentials.subtitle")}
      onNext={() => void onNext()}
      onBack={isOnboarding ? undefined : goBack}
      nextLoading={loading}
      nextLabel={index + 1 < services.length ? t("web.settings.onboarding.nextService") : t("web.settings.onboarding.continue")}
      backLink={{ to: "/verification", label: t("web.nav.verification") }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="certificationName">{t("onboarding.credentials.name")}</Label>
          <Input id="certificationName" value={certificationName} onChange={(e) => setCertificationName(e.target.value)} className="h-10" disabled={loading} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="certifyingBody">{t("onboarding.credentials.body")}</Label>
          <Input id="certifyingBody" value={certifyingBody} onChange={(e) => setCertifyingBody(e.target.value)} className="h-10" disabled={loading} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="yearObtained">{t("onboarding.credentials.year")}</Label>
          <Input
            id="yearObtained"
            inputMode="numeric"
            maxLength={4}
            placeholder="2020"
            value={yearObtained}
            onChange={(e) => setYearObtained(e.target.value)}
            className="h-10"
            disabled={loading}
          />
        </div>
      </div>

      <DocumentPicker
        label={t("onboarding.credentials.document")}
        hint={t("web.settings.onboarding.certificationHint")}
        value={certificationDoc}
        onChange={setCertificationDoc}
        disabled={loading}
      />
      <DocumentPicker
        label={t("onboarding.credentials.certificate")}
        hint={t("web.settings.onboarding.qualificationHint")}
        value={qualificationDoc}
        onChange={setQualificationDoc}
        disabled={loading}
      />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </WizardFrame>
  );
}
