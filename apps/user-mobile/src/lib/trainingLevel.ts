import type { SessionFeel } from "@fitness-ai-app/types";

export type TrainingLevel = "beginner" | "intermediate" | "advanced";
const ORDER: TrainingLevel[] = ["beginner", "intermediate", "advanced"];

export const TRAINING_LEVEL_LABEL: Record<TrainingLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/**
 * Figma train/after-first-workout "How did that feel? We'll set your level
 * from this." (24 Oct 2026): Too easy moves the level up one step, Too hard
 * down one step, About right keeps it. No level on file counts as beginner.
 * Pure (tests/trainingLevel.check.cjs).
 */
export function levelAfterFirstWorkout(current: TrainingLevel | null | undefined, feel: SessionFeel): TrainingLevel {
  const i = ORDER.indexOf(current ?? "beginner");
  if (feel === "easy") return ORDER[Math.min(i + 1, ORDER.length - 1)];
  if (feel === "hard") return ORDER[Math.max(i - 1, 0)];
  return ORDER[i];
}
