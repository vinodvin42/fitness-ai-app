import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OnboardingProfileInput } from "@fitness-ai-app/types";
import { submitOnboarding } from "../api/users";
import { trackClientEvent } from "../api/analytics";
import * as secureStore from "../lib/secureStore";

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

/** The 5 data-entry screens a draft can resume into — AssessmentSummary/
 * PlanGenerating are deliberately not resume targets (see markScreenReached
 * below). */
type ResumableScreenName = "AboutYou" | "Goals" | "TrainingLevel" | "FoodDiet" | "Safety";

const DRAFT_STORAGE_KEY = "onboardingWizardDraft";

interface OnboardingWizardContextValue {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  toggleListValue: (field: "goals" | "allergens" | "medicalConditions" | "injuries", value: string) => void;
  isSubmitting: boolean;
  /** Submits the assessment (PUT /users/me/onboarding) — this alone marks
   * Assessment "completed" server-side. Does NOT flip the app over to
   * MainTabs; PlanGeneratingScreen's own "Get Started"/"Skip" action calls
   * AuthContext.markOnboardingCompleted() for that, once the user has
   * actually seen the Plan-generation outcome (U2, 15 Sep 2026). */
  submit: () => Promise<void>;
  /** True once the async draft-resume read (below) has finished — the
   * Navigator isn't rendered until this is true, so its initialRouteName
   * is never set to the wrong (default) screen for a split second. */
  isHydrated: boolean;
  /** Which screen to resume into: the last one a real draft reached, or
   * "AboutYou" for a fresh start / no draft found. */
  resumeRouteName: ResumableScreenName;
  /** Called by each of the 5 data-entry screens right before navigating
   * forward, so an app-kill mid-wizard resumes at the next screen rather
   * than the one just left. */
  markScreenReached: (screen: ResumableScreenName) => void;
  /** Deletes the persisted draft — called once submit() succeeds, since
   * "resumable" only describes the pre-completion assessment states (see
   * docs' own Core State Requirements table: Assessment vs Plan are
   * separate domains). */
  clearDraft: () => Promise<void>;
}

const OnboardingWizardContext = createContext<OnboardingWizardContextValue | undefined>(undefined);

/**
 * Local accumulator for the wizard (About You -> Goals -> Training Level ->
 * Food/Diet -> Safety -> Assessment Summary), now also a resumable draft
 * (U2, 15 Sep 2026 — Developer 1's own "in progress / resumable" Assessment
 * state, see docs/mobile/07-open-questions-gaps.md). Nothing is sent to the
 * API until AssessmentSummaryScreen's confirm step (single PUT
 * /users/me/onboarding) — the draft persisted here is purely local,
 * survives an app kill/restart, and is deleted the moment that PUT
 * succeeds.
 *
 * **Honest scope note:** this is a same-device resume only (secureStore is
 * local to the device), not a cross-device one — a real cross-device
 * resume would need a partial-save server endpoint, a larger change this
 * pass doesn't attempt. It also can't rescue a kill that happens exactly
 * during PlanGeneratingScreen (after the assessment PUT succeeds, before
 * the user taps through) — the server already considers Assessment
 * "completed" at that point, so relaunching drops the user straight into
 * MainTabs having skipped seeing their plan. Documented here rather than
 * silently accepted: fixing it would mean conflating "assessment
 * completed" with "plan seen", which the spec's own state tables keep
 * separate.
 */
export function OnboardingWizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState);
  const [resumeRouteName, setResumeRouteName] = useState<ResumableScreenName>("AboutYou");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await secureStore.getItemAsync(DRAFT_STORAGE_KEY);
        if (raw) {
          const draft = JSON.parse(raw) as { state: WizardState; lastScreen: ResumableScreenName };
          setState({ ...initialState, ...draft.state });
          setResumeRouteName(draft.lastScreen);
          // §8 "assessment.resumed" — a real draft actually reached a
          // screen past AboutYou, i.e. genuine in-progress work is being
          // picked back up, not just a freshly-created empty draft.
          if (draft.lastScreen !== "AboutYou") {
            trackClientEvent("assessment.resumed", undefined, { lastScreen: draft.lastScreen });
          } else {
            trackClientEvent("assessment.started");
          }
        } else {
          // §8 "assessment.started" — no draft at all, a genuinely fresh
          // start (first time opening the wizard, or a prior attempt
          // already completed and cleared its draft).
          trackClientEvent("assessment.started");
        }
      } catch {
        // Corrupted/unreadable draft — start fresh rather than block the
        // wizard on a resumability convenience.
      } finally {
        setIsHydrated(true);
      }
    })();
  }, []);

  // Persists on every change, but only once hydration has actually run —
  // otherwise this would immediately overwrite a real draft with the
  // empty initialState during that brief async read.
  useEffect(() => {
    if (!isHydrated) return;
    secureStore.setItemAsync(DRAFT_STORAGE_KEY, JSON.stringify({ state, lastScreen: resumeRouteName })).catch(() => {
      // Best-effort — resumability is a convenience, never a requirement
      // to proceed through the wizard.
    });
  }, [state, resumeRouteName, isHydrated]);

  const update = (patch: Partial<WizardState>) => setState((prev) => ({ ...prev, ...patch }));

  const toggleListValue = (field: "goals" | "allergens" | "medicalConditions" | "injuries", value: string) => {
    setState((prev) => {
      const list = prev[field];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [field]: next };
    });
  };

  const markScreenReached = (screen: ResumableScreenName) => setResumeRouteName(screen);

  const clearDraft = async () => {
    try {
      await secureStore.deleteItemAsync(DRAFT_STORAGE_KEY);
    } catch {
      // Best-effort cleanup — a leftover draft is harmless once
      // Assessment is already server-side "completed".
    }
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
      await clearDraft();
    } finally {
      setIsSubmitting(false);
    }
  };

  const value = useMemo(
    () => ({
      state,
      update,
      toggleListValue,
      isSubmitting,
      submit,
      isHydrated,
      resumeRouteName,
      markScreenReached,
      clearDraft,
    }),
    [state, isSubmitting, isHydrated, resumeRouteName],
  );

  return <OnboardingWizardContext.Provider value={value}>{children}</OnboardingWizardContext.Provider>;
}

export function useOnboardingWizard() {
  const ctx = useContext(OnboardingWizardContext);
  if (!ctx) throw new Error("useOnboardingWizard must be used within an OnboardingWizardProvider");
  return ctx;
}
