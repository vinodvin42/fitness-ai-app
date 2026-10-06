/**
 * Bundled static content for Recover 06-11 (yoga / mobility / breathing /
 * mindful practice). There is no content API for this — see the API's
 * module list — so routines live in the app bundle. Timings are gentle
 * defaults, not prescriptions; the screens carry a general-wellness note.
 */
export type RoutineKind = "yoga" | "mobility" | "mindful";

export interface GuidedStep {
  title: string;
  instruction: string;
  seconds: number;
}

export interface GuidedRoutine {
  id: string;
  kind: RoutineKind;
  title: string;
  subtitle: string;
  level: "Beginner" | "All levels";
  description: string;
  /** Sent as MindfulnessLog.type when a session completes. */
  logType: string;
  steps: GuidedStep[];
}

export const GUIDED_ROUTINES: GuidedRoutine[] = [
  {
    id: "gentle-yoga",
    kind: "yoga",
    title: "Gentle Yoga",
    subtitle: "Slow full-body flow",
    level: "Beginner",
    description: "A calm, low-impact flow to loosen the spine and hips. Move within a comfortable range and breathe steadily.",
    logType: "yoga",
    steps: [
      { title: "Easy seated breathing", instruction: "Sit tall, rest your hands on your knees and take slow breaths through the nose.", seconds: 45 },
      { title: "Cat–cow", instruction: "On hands and knees, round your back on the exhale, then lift chest and tailbone on the inhale.", seconds: 60 },
      { title: "Child's pose", instruction: "Sit back toward your heels, reach arms forward and rest your forehead down.", seconds: 45 },
      { title: "Low lunge (right)", instruction: "Step the right foot forward, lower the back knee and lengthen up through the chest.", seconds: 40 },
      { title: "Low lunge (left)", instruction: "Switch sides, keeping the front knee over the ankle.", seconds: 40 },
      { title: "Seated forward fold", instruction: "Extend your legs, hinge from the hips and let your spine stay long. Soften the knees if needed.", seconds: 45 },
      { title: "Supine twist", instruction: "Lie on your back, drop both knees to one side and look the other way. Switch halfway through.", seconds: 60 },
      { title: "Final rest", instruction: "Lie flat, let your arms fall open and release your breathing.", seconds: 60 },
    ],
  },
  {
    id: "shoulder-hamstring-mobility",
    kind: "mobility",
    title: "Shoulder & Hamstring Mobility",
    subtitle: "Pre or post workout",
    level: "All levels",
    description: "Targets the areas that tighten most after lifting and desk time. Stay in the stretch, never in pain.",
    logType: "mobility",
    steps: [
      { title: "Shoulder rolls", instruction: "Roll both shoulders slowly backward in big circles.", seconds: 30 },
      { title: "Cross-body shoulder stretch (right)", instruction: "Draw the right arm across your chest and hold it gently with the left hand.", seconds: 30 },
      { title: "Cross-body shoulder stretch (left)", instruction: "Switch arms and keep your shoulders relaxed.", seconds: 30 },
      { title: "Thread the needle", instruction: "From hands and knees, slide one arm under your chest and rest the shoulder down. Switch halfway.", seconds: 60 },
      { title: "Standing hamstring hinge", instruction: "Place a heel forward, hinge at the hips with a flat back until you feel a stretch behind the thigh.", seconds: 40 },
      { title: "Standing hamstring hinge (other leg)", instruction: "Switch legs and keep the hips square.", seconds: 40 },
      { title: "Supine hamstring stretch", instruction: "Lie back, raise one leg and hold behind the thigh. Switch halfway.", seconds: 60 },
    ],
  },
  {
    id: "mindful-practice",
    kind: "mindful",
    title: "Mindful Practice",
    subtitle: "Five-minute reset",
    level: "All levels",
    description: "A short guided pause: settle, notice your breath and body, and close with a few quiet breaths.",
    logType: "mindfulness",
    steps: [
      { title: "Settle in", instruction: "Sit or lie comfortably. Let your shoulders drop and close your eyes if that feels okay.", seconds: 40 },
      { title: "Follow the breath", instruction: "Notice the breath where you feel it most. You don't need to change it.", seconds: 90 },
      { title: "Body scan", instruction: "Move attention slowly from your feet up to your head, softening each area as you pass.", seconds: 90 },
      { title: "Notice thoughts", instruction: "When your mind wanders, gently note it and return to the breath. No judgement.", seconds: 50 },
      { title: "Close", instruction: "Take three slow breaths, wiggle fingers and toes, and open your eyes.", seconds: 30 },
    ],
  },
];

export function getRoutine(id: string): GuidedRoutine | undefined {
  return GUIDED_ROUTINES.find((r) => r.id === id);
}

export function routineSeconds(r: GuidedRoutine): number {
  return r.steps.reduce((sum, s) => sum + s.seconds, 0);
}

export type BreathPhaseLabel = "Inhale" | "Hold" | "Exhale";

export interface BreathingPattern {
  id: string;
  name: string;
  ratio: string;
  description: string;
  phases: Array<{ label: BreathPhaseLabel; seconds: number }>;
}

export const BREATHING_PATTERNS: BreathingPattern[] = [
  {
    id: "box",
    name: "Box breathing",
    ratio: "4-4-4-4",
    description: "Equal inhale, hold, exhale and hold. Steadying and easy to learn.",
    phases: [
      { label: "Inhale", seconds: 4 },
      { label: "Hold", seconds: 4 },
      { label: "Exhale", seconds: 4 },
      { label: "Hold", seconds: 4 },
    ],
  },
  {
    id: "478",
    name: "4-7-8 breathing",
    ratio: "4-7-8",
    description: "A long exhale to help you wind down. Stop if you feel light-headed.",
    phases: [
      { label: "Inhale", seconds: 4 },
      { label: "Hold", seconds: 7 },
      { label: "Exhale", seconds: 8 },
    ],
  },
  {
    id: "coherent",
    name: "Coherent breathing",
    ratio: "5-5",
    description: "A smooth five-second inhale and exhale, roughly six breaths a minute.",
    phases: [
      { label: "Inhale", seconds: 5 },
      { label: "Exhale", seconds: 5 },
    ],
  },
];

export const BREATHING_DURATIONS_MIN = [1, 3, 5] as const;

export const WELLNESS_NOTE =
  "General wellness guidance only, not medical advice. Stop if anything hurts or you feel dizzy.";
