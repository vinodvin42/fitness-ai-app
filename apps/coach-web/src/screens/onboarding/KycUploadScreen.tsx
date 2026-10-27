import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { submitKyc } from "@/api/professionalOnboarding";
import { extractErrorMessage } from "@/lib/apiError";
import { DocumentPicker, useGoBack, useIsOnboarding, WizardFrame, wizardPaths, type PickedDocument } from "./OnboardingLayout";

/**
 * Onboarding step 3, ported from apps/coach-mobile's KycUploadScreen: one
 * government ID for every service. Deliberately does NOT call
 * markOnboardingCompleted() here: that would send the coach straight to the
 * app before they see their verification status. The status screen's
 * "Go to Dashboard" does it, as in the old app.
 *
 * Flagged in the old app, still true: this goes to the same base64 document
 * storage as the credentials; see docs/coach/07-open-questions-gaps.md gap §7.
 */
export function KycUploadScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnboarding = useIsOnboarding();
  const goBack = useGoBack("/verification");
  const [kycDocument, setKycDocument] = useState<PickedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onNext = async () => {
    if (!kycDocument) return;
    setError(null);
    setLoading(true);
    try {
      await submitKyc({ kycDocumentData: kycDocument.dataUri });
      await queryClient.invalidateQueries({ queryKey: ["professional-onboarding-status"] });
      navigate(wizardPaths(isOnboarding).status);
    } catch (err) {
      setError(extractErrorMessage(err, t("web.settings.onboarding.submitKycFailed")));
      setLoading(false);
    }
  };

  return (
    <WizardFrame
      step={3}
      total={3}
      label={t("onboarding.kyc.step")}
      title={t("onboarding.kyc.title")}
      subtitle={t("onboarding.kyc.subtitle")}
      onNext={() => void onNext()}
      onBack={isOnboarding ? undefined : goBack}
      nextDisabled={!kycDocument}
      nextLoading={loading}
      backLink={{ to: "/verification", label: t("web.nav.verification") }}
    >
      <DocumentPicker
        label={t("web.settings.onboarding.kycDocument")}
        hint={t("web.settings.onboarding.kycHint")}
        value={kycDocument}
        onChange={setKycDocument}
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
