import type { OnboardingStackParamList } from "./OnboardingStack";

/**
 * The setup screens that show the "Step N of M" progress bar, in the order
 * OnboardingStack shows them. Every WizardLayout reads its step and total
 * from here, so adding, removing or reordering a screen can't leave the
 * numbers repeating or the total wrong (they used to be typed by hand and
 * read "of 5" across eight screens).
 *
 * HealthDataSkip and PlanGenerating are left out: neither shows the bar.
 * Kept out of OnboardingStack.tsx itself because that file imports every
 * screen, and the screens importing a value back from it would be circular.
 */
export const ONBOARDING_PROGRESS_STEPS = [
  "AboutYou",
  "Schedule",
  "Goals",
  "TrainingLevel",
  "Equipment",
  "FoodDiet",
  "Safety",
  "AssessmentSummary",
] as const satisfies readonly (keyof OnboardingStackParamList)[];

export type OnboardingProgressStep = (typeof ONBOARDING_PROGRESS_STEPS)[number];

/** `{ step, total }` for a setup screen — spread straight into WizardLayout. */
export function onboardingStep(screen: OnboardingProgressStep): { step: number; total: number } {
  return { step: ONBOARDING_PROGRESS_STEPS.indexOf(screen) + 1, total: ONBOARDING_PROGRESS_STEPS.length };
}
