import React, { createContext, useContext, useMemo, useState } from "react";
import type { OnboardingProfileInput } from "@fitness-ai-app/types";
import { submitOnboarding } from "../api/users";
import { useAuth } from "./AuthContext";

type WizardState = Partial<OnboardingProfileInput> & {
  goals: string[];
  allergens: string[];
  medicalConditions: string[];
  injuries: string[];
};

const initialState: WizardState = {
  goals: [],
  allergens: [],
  medicalConditions: [],
  injuries: [],
};

interface OnboardingWizardContextValue {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  toggleListValue: (field: "goals" | "allergens" | "medicalConditions" | "injuries", value: string) => void;
  isSubmitting: boolean;
  submit: () => Promise<void>;
}

const OnboardingWizardContext = createContext<OnboardingWizardContextValue | undefined>(undefined);

/**
 * Local, in-memory accumulator for the 5-step wizard (About You -> Goals ->
 * Training Level -> Food/Diet -> Safety). Nothing is sent to the API until
 * the final step, matching the single PUT /users/me/onboarding endpoint —
 * see docs/mobile/03-screen-inventory.md §A.
 */
export function OnboardingWizardProvider({ children }: { children: React.ReactNode }) {
  const { markOnboardingCompleted } = useAuth();
  const [state, setState] = useState<WizardState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }));

  const toggleListValue = (field: "goals" | "allergens" | "medicalConditions" | "injuries", value: string) => {
    setState((prev) => {
      const list = prev[field];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [field]: next };
    });
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      await submitOnboarding({
        gender: state.gender,
        age: state.age,
        weightKg: state.weightKg,
        heightCm: state.heightCm,
        goals: state.goals,
        trainingLevel: state.trainingLevel,
        dietType: state.dietType,
        allergens: state.allergens,
        medicalConditions: state.medicalConditions,
        injuries: state.injuries,
      });
      markOnboardingCompleted(); // flips RootNavigator over to MainTabs
    } finally {
      setIsSubmitting(false);
    }
  };

  const value = useMemo(
    () => ({ state, update, toggleListValue, isSubmitting, submit }),
    [state, isSubmitting],
  );

  return <OnboardingWizardContext.Provider value={value}>{children}</OnboardingWizardContext.Provider>;
}

export function useOnboardingWizard() {
  const ctx = useContext(OnboardingWizardContext);
  if (!ctx) throw new Error("useOnboardingWizard must be used within an OnboardingWizardProvider");
  return ctx;
}
