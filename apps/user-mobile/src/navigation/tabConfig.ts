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
