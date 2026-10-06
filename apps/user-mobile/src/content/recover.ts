/**
 * Bundled static content for Recover 06-11 (yoga / mobility / breathing /
 * mindful practice). There is no content API for this - routines live in the
 * app bundle. Plain, general-wellness guidance only (not medical advice);
 * timings are gentle defaults, not prescriptions.
 */
export type RoutineKind = "yoga" | "mobility" | "mindful";
export type LibraryCategory = "Yoga" | "Breathing" | "Mobility";

export interface GuidedStep {
  title: string;
  instruction: string;
  /** Short line for the overview list. */
  summary: string;
  seconds: number;
  /** Gentler alternative shown on the routine overview. */
  easier?: string;
  /** Extra tag shown next to the minutes, e.g. "Both sides". */
  note?: string;
}

export interface GuidedRoutine {
  id: string;
  kind: RoutineKind;
  category: LibraryCategory;
  title: string;
  /** Library card meta line, e.g. "15 min · Mat · Optional cushion". */
  meta: string;
  /** Overview header sub-line, e.g. "Session overview". */
  overviewLabel: string;
  level: "Beginner" | "Gentle" | "All levels";
  pace: string;
  description: string;
  /** "What you'll need" copy. */
  needs: string;
  /** Sent as MindfulnessLog.type when a session completes. */
  logType: string;
  /** Safety card on the overview. */
  safetyTitle: string;
  safetyBody: string;
  steps: GuidedStep[];
}

export const GUIDED_ROUTINES: GuidedRoutine[] = [
  {
    id: "gentle-yoga",
    kind: "yoga",
    category: "Yoga",
    title: "Gentle Yoga",
    meta: "15 min · Mat · Optional cushion",
    overviewLabel: "Session overview",
    level: "Beginner",
    pace: "Gentle",
    description: "An unhurried sequence of seated, tabletop and resting poses. Find a pace that feels supportive.",
    needs: "A mat and towel. A cushion or sturdy chair is optional for support.",
    logType: "yoga",
    safetyTitle: "Listen to your body",
    safetyBody:
      "Never force a stretch. Stop for pain, dizziness or discomfort. If you have an injury, are pregnant or are unsure about movement, check with a qualified professional first.",
    steps: [
      {
        title: "Settle & seated movement",
        summary: "Sit tall, ease into shoulder circles.",
        instruction:
          "Sit comfortably on the mat or a cushion. Let your shoulders drop, take slow breaths, then add gentle shoulder circles and side bends.",
        seconds: 180,
      },
      {
        title: "Cat-cow",
        summary: "Move slowly on hands and knees.",
        instruction:
          "As you breathe out, gently round your back. On your next inhale, ease back toward neutral. Keep the movement small, with soft wrists and neck.",
        seconds: 180,
      },
      {
        title: "Supported child's pose",
        summary: "Rest your torso on a cushion if useful.",
        instruction:
          "Sit back toward your heels, fold forward and rest your chest and head on a cushion or folded blanket. Breathe slowly into your back.",
        seconds: 180,
      },
      {
        title: "Reclined hamstring stretch",
        summary: "Use a towel, keep a soft bend in the knee.",
        instruction:
          "Lie on your back. Loop a towel around one foot and lift the leg only as far as feels comfortable, keeping a soft knee. Switch halfway.",
        seconds: 240,
      },
      {
        title: "Comfortable rest",
        summary: "Lie down or sit, breathe naturally.",
        instruction: "Lie down or sit in a comfortable position, let your breathing settle and release any effort.",
        seconds: 120,
      },
    ],
  },
  {
    id: "shoulder-hamstring-mobility",
    kind: "mobility",
    category: "Mobility",
    title: "Shoulder & hamstring mobility",
    meta: "8 min · Gentle · Chair + towel",
    overviewLabel: "Mobility routine · 8 min · Gentle",
    level: "Gentle",
    pace: "Gentle",
    description: "Small movements with easier options, for the areas that tighten most after lifting and desk time.",
    needs: "A sturdy chair and a towel.",
    logType: "mobility",
    safetyTitle: "Stop if you feel pain",
    safetyBody:
      "Stop for sharp pain, tingling or dizziness. Skip any movement that feels uncomfortable. For an existing shoulder or hamstring injury, seek professional advice before starting.",
    steps: [
      {
        title: "Settle & warm up",
        summary: "Stand or sit tall and march gently.",
        instruction: "Stand or sit tall. Gently march or shift your weight, keeping your shoulders relaxed.",
        easier: "Stay seated if standing feels unsteady.",
        seconds: 60,
      },
      {
        title: "Gentle shoulder rolls",
        summary: "Slow circles, small and easy.",
        instruction: "Roll your shoulders slowly back, then forward. Keep the circles small and your neck relaxed.",
        easier: "Make smaller circles or move one shoulder at a time.",
        seconds: 120,
      },
      {
        title: "Supported shoulder reach",
        summary: "Hands on a chair back, hinge gently.",
        instruction: "Rest your hands on a sturdy chair back. Step back slightly and hinge at your hips, arms relaxed.",
        easier: "Stay upright and place your hands lower. Do not push into the chair.",
        seconds: 120,
      },
      {
        title: "Seated hamstring stretch",
        summary: "One leg out, heel down, soft knee.",
        instruction:
          "Sit on a sturdy chair. Extend one leg with the heel down and the knee soft. Hinge forward slightly and switch after 1 minute.",
        easier: "Bend your knee more or use a towel under your thigh for support.",
        seconds: 120,
        note: "Both sides",
      },
      {
        title: "Ease out",
        summary: "Return upright and breathe.",
        instruction: "Return upright slowly. Bend your knees and gently move your shoulders. Breathe normally.",
        easier: "Rest seated for as long as you need.",
        seconds: 60,
      },
    ],
  },
  {
    id: "mindful-practice",
    kind: "mindful",
    category: "Breathing",
    title: "A little space to settle",
    meta: "5 min · Seated or lying · No equipment",
    overviewLabel: "Mindful practice",
    level: "All levels",
    pace: "Calm",
    description: "Gentle guided meditation, 5 minutes. Find a comfortable position and let your breathing stay natural.",
    needs: "Nothing - a comfortable place to sit or lie down.",
    logType: "mindfulness",
    safetyTitle: "Eyes open or closed",
    safetyBody:
      "Eyes open or closed - your choice. This is wellness practice, not treatment.",
    steps: [
      {
        title: "Settle in",
        summary: "Find a comfortable position.",
        instruction: "Let your shoulders drop and your breathing stay natural. Notice the support beneath you.",
        seconds: 60,
      },
      {
        title: "Follow the breath",
        summary: "Notice where you feel it most.",
        instruction: "Notice where you feel your breath most. You do not need to change it.",
        seconds: 90,
      },
      {
        title: "Notice your body",
        summary: "Soften each area as you pass.",
        instruction: "Move your attention slowly from your feet to your head, softening each area as you pass.",
        seconds: 60,
      },
      {
        title: "Return to this breath",
        summary: "Gently come back when your mind wanders.",
        instruction:
          "If your mind has wandered, that's okay. Notice the support beneath you. Gently bring your attention back, without trying to change anything.",
        seconds: 60,
      },
      {
        title: "Close",
        summary: "Three slow breaths, then open your eyes.",
        instruction: "Take three slow breaths, move your fingers and toes, and open your eyes when you are ready.",
        seconds: 30,
      },
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
  /** Primary instruction while a session runs, by phase. */
  cues: { Inhale: string; Hold: string; Exhale: string };
  phases: Array<{ label: BreathPhaseLabel; seconds: number }>;
}

export const BREATHING_PATTERNS: BreathingPattern[] = [
  {
    id: "easy",
    name: "Easy paced breathing",
    ratio: "4-6",
    description: "A simple rhythm, at your own pace: breathe in for 4, breathe out for 6.",
    cues: {
      Inhale: "Inhale gently through your nose.",
      Hold: "Pause softly.",
      Exhale: "Exhale slowly, like a soft sigh.",
    },
    phases: [
      { label: "Inhale", seconds: 4 },
      { label: "Exhale", seconds: 6 },
    ],
  },
  {
    id: "box",
    name: "Box breathing",
    ratio: "4-4-4-4",
    description: "Equal inhale, hold, exhale and hold. Steadying and easy to learn.",
    cues: { Inhale: "Inhale gently through your nose.", Hold: "Hold softly, without strain.", Exhale: "Exhale slowly." },
    phases: [
      { label: "Inhale", seconds: 4 },
      { label: "Hold", seconds: 4 },
      { label: "Exhale", seconds: 4 },
      { label: "Hold", seconds: 4 },
    ],
  },
  {
    id: "coherent",
    name: "Coherent breathing",
    ratio: "5-5",
    description: "A smooth five-second inhale and exhale, roughly six breaths a minute.",
    cues: { Inhale: "Inhale gently through your nose.", Hold: "Pause softly.", Exhale: "Exhale smoothly." },
    phases: [
      { label: "Inhale", seconds: 5 },
      { label: "Exhale", seconds: 5 },
    ],
  },
];

export const BREATHING_DURATIONS_MIN = [1, 3, 5] as const;
export const DEFAULT_BREATHING_MIN = 5;

export const BREATHING_SAFETY =
  "No breath holds. Breathe normally at any time. Stop if you feel dizzy, breathless or uncomfortable.";

export const WELLNESS_NOTE =
  "General wellness guidance only, not medical advice. Stop if anything hurts or you feel dizzy.";

/** Add Device (Recover 03) - static category + brand list. */
export type DeviceProvider = "apple_health" | "health_connect" | "garmin" | "fitbit" | "whoop" | "oura";

export interface DeviceCategory {
  key: "smartwatch" | "band" | "tracker" | "scale" | "other";
  chip: string;
  title: string;
  kind: "watch" | "band" | "ring" | "scale" | "other";
  /** `provider` is the platform the data actually flows through in this build. */
  devices: Array<{ name: string; brand: string; provider: DeviceProvider }>;
}

export const DEVICE_CATEGORIES: DeviceCategory[] = [
  {
    key: "smartwatch",
    chip: "Smartwatches",
    title: "Smartwatches",
    kind: "watch",
    devices: [
      { name: "Apple Watch", brand: "Apple", provider: "apple_health" },
      { name: "Samsung Galaxy Watch", brand: "Samsung", provider: "health_connect" },
      { name: "Garmin Venu", brand: "Garmin", provider: "garmin" },
    ],
  },
  {
    key: "band",
    chip: "Bands",
    title: "Fitness Bands",
    kind: "band",
    devices: [
      { name: "Mi Band 8", brand: "Xiaomi", provider: "health_connect" },
      { name: "Noise ColorFit", brand: "Noise", provider: "health_connect" },
      { name: "boAt Wave", brand: "boAt", provider: "health_connect" },
    ],
  },
  {
    key: "tracker",
    chip: "Trackers",
    title: "Activity Trackers",
    kind: "band",
    devices: [
      { name: "Fitbit Charge 6", brand: "Fitbit", provider: "fitbit" },
      { name: "WHOOP 4.0", brand: "WHOOP", provider: "whoop" },
    ],
  },
  {
    key: "scale",
    chip: "Scales",
    title: "Smart Scales",
    kind: "scale",
    devices: [{ name: "Smart Scale", brand: "Any scale that writes to your health app", provider: "health_connect" }],
  },
  {
    key: "other",
    chip: "Other",
    title: "Other Devices",
    kind: "ring",
    devices: [{ name: "Oura Ring", brand: "Oura", provider: "oura" }],
  },
];

export type PermissionKey = "steps" | "heart_rate" | "sleep" | "spo2" | "stress" | "workouts";

/** Recover 04 - Data Permissions rows. */
export const PERMISSION_ROWS: Array<{
  key: PermissionKey;
  label: string;
  icon: "footprints" | "heart" | "moon" | "droplet" | "activity" | "dumbbell";
}> = [
  { key: "steps", label: "Steps & Distance", icon: "footprints" },
  { key: "heart_rate", label: "Heart Rate Continuous", icon: "heart" },
  { key: "sleep", label: "Sleep Tracking", icon: "moon" },
  { key: "spo2", label: "Blood Oxygen SpO2", icon: "droplet" },
  { key: "stress", label: "Stress Level", icon: "activity" },
  { key: "workouts", label: "Workout Auto-Detect", icon: "dumbbell" },
];
