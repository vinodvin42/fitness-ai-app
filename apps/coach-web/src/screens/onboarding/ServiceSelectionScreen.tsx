import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ProfessionalServiceType } from "@fitness-ai-app/types";
import { setMyGender } from "@/api/professionalAuth";
import { selectServices } from "@/api/professionalOnboarding";
import { extractErrorMessage } from "@/lib/apiError";
import { SERVICE_LABELS } from "@/lib/format";
import { SelectCard, WizardFrame, wizardPaths } from "./OnboardingLayout";

const SERVICES: { value: ProfessionalServiceType; subtitleKey: string }[] = [
  { value: "fitness", subtitleKey: "web.settings.onboarding.fitnessSubtitle" },
  { value: "nutrition", subtitleKey: "web.settings.onboarding.nutritionSubtitle" },
];

/**
 * Onboarding step 1, ported from apps/coach-mobile's ServiceSelectionScreen:
 * pick one or both services (not mutually exclusive), optionally say your
 * gender, then PUT /professionals/me/services and loop through each
 * service's credentials.
 */
export function ServiceSelectionScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ProfessionalServiceType[]>([]);
  const [gender, setGender] = useState<"female" | "male" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = (value: ProfessionalServiceType) =>
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const onNext = async () => {
    setError(null);
    setLoading(true);
    try {
      await selectServices({ services: selected });
      if (gender) await setMyGender(gender);
      // Keep the order the cards show, whatever order they were ticked in.
      const ordered = SERVICES.map((s) => s.value).filter((v) => selected.includes(v));
      navigate(wizardPaths(true).credentials(ordered, 0));
    } catch (err) {
      setError(extractErrorMessage(err, t("web.settings.onboarding.saveServicesFailed")));
      setLoading(false);
    }
  };

  return (
    <WizardFrame
      step={1}
      total={3}
      label={t("onboarding.serviceSelection.step")}
      title={t("onboarding.serviceSelection.title")}
      subtitle={t("onboarding.serviceSelection.subtitle")}
      onNext={() => void onNext()}
      nextDisabled={selected.length === 0}
      nextLoading={loading}
    >
      <div className="space-y-2">
        {SERVICES.map((service) => (
          <SelectCard
            key={service.value}
            title={SERVICE_LABELS[service.value]}
            subtitle={t(service.subtitleKey)}
            selected={selected.includes(service.value)}
            onSelect={() => toggle(service.value)}
            multiSelect
          />
        ))}
      </div>

      <div className="space-y-1 pt-2">
        <h2 className="text-base font-semibold">{t("onboarding.serviceSelection.genderTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("onboarding.serviceSelection.genderHelp")}</p>
      </div>
      <div role="radiogroup" aria-label={t("onboarding.serviceSelection.genderTitle")} className="grid gap-2 sm:grid-cols-2">
        <SelectCard title={t("profile.female")} selected={gender === "female"} onSelect={() => setGender(gender === "female" ? null : "female")} />
        <SelectCard title={t("profile.male")} selected={gender === "male"} onSelect={() => setGender(gender === "male" ? null : "male")} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </WizardFrame>
  );
}
