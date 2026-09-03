/**
 * Shared contextual sub-panel for Module 09 — Analytics, added 26 Aug
 * 2026 once 09.02 Engagement and 09.03 Fitness & Nutrition joined 09.01
 * User Analytics as real, separate screens — the "second screen triggers
 * a subNav" pattern every other multi-screen module in this console
 * already follows (see AppShell.tsx's own doc comment). 09.01 previously
 * had no subNav (see UserAnalyticsScreen.tsx's original 25 Aug 2026
 * comment) since its own 7-tab spec was folded into one screen's in-page
 * tabs and nothing else in Module 09 was real yet — that reasoning no
 * longer holds now that 09.02/09.03 are genuinely distinct screens, not
 * more tabs of 09.01.
 *
 * **27 Aug 2026: 09.06 Unit Economics / Cohorts joins as a fourth real
 * screen** — re-investigating `reports/build-plan.html`'s own "needs your
 * decision" framing for CAC found the acquisition-cost data it said was
 * missing had already shipped a day earlier, as Finance's real
 * `Expense.category: "marketing"`. 09.04 Business Analytics and 09.05
 * Geographic Analytics remain unbuilt/folded-in respectively — see
 * adminAnalytics.service.ts's top comment for the full breakdown.
 */
// 31 Aug 2026: 09.04 Business Analytics joins as a fifth real screen —
// unblocked once per-coach commission + Coach Settlements shipped (the
// take-rate decision it was waiting on). 09.05 Geographic stays folded into
// 09.01's own tab strip. See adminAnalytics.service.ts.
export const ANALYTICS_SUB_NAV = [
  { label: "User Analytics", path: "/analytics" },
  { label: "Engagement", path: "/analytics/engagement" },
  { label: "Fitness & Nutrition", path: "/analytics/fitness-nutrition" },
  { label: "Business", path: "/analytics/business" },
  { label: "Unit Economics", path: "/analytics/unit-economics" },
];
