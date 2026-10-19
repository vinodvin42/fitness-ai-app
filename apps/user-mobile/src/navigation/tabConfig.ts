import type { IconName } from "../components/Icon";

/**
 * Bottom-tab icons and label keys in one place, so MainTabs and the
 * component kit render the same thing. Route names (Train/Fuel/Recover)
 * are ids and stay English; the visible labels come from `nav.*` in the
 * locale files (Workouts / Food / Recovery since Oct 2026).
 */
export const TAB_ORDER = ["Today", "Train", "Fuel", "Recover", "More"] as const;
export type TabRoute = (typeof TAB_ORDER)[number];

export const TAB_ICONS: Record<TabRoute, IconName> = {
  Today: "home",
  Train: "dumbbell",
  Fuel: "utensils",
  Recover: "heart-pulse",
  More: "menu",
};

export const TAB_LABEL_KEYS: Record<TabRoute, string> = {
  Today: "nav.today",
  Train: "nav.train",
  Fuel: "nav.fuel",
  Recover: "nav.recover",
  More: "nav.more",
};

/**
 * Focused tasks (Oct 2026): these stack routes open without the tab bar,
 * so a workout, guided player, checkout or meal entry is finished or left
 * on purpose rather than by an accidental tab tap. Names are the existing
 * route ids in each tab's stack; screens without a tab bar must pad their
 * own bottom safe area.
 */
export const FOCUSED_TASK_ROUTES: ReadonlySet<string> = new Set([
  // Train
  "ActiveWorkout",
  "SetRestTracker",
  "ExerciseSwap",
  "WorkoutComplete",
  // Recover
  "GuidedSession",
  "GuidedBreathing",
  // More
  "Checkout",
  "PaymentResult",
  // Fuel
  "LogMeal",
  "ConfirmFoodEstimate",
  "BarcodeScanner",
  "SnapMeal",
  "RecipeCookMode",
]);
