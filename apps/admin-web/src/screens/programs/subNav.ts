/**
 * Shared contextual sub-panel for every Module 05 screen this pass ships
 * — see AppShell.tsx's "21 Aug 2026" comment for the pattern, first used
 * by Professionals. 05.01/05.02/05.03 shipped 22 Aug 2026; **Review/
 * Approval (05.05) joined 25 Aug 2026** — see adminPrograms.service.ts's
 * own doc comment for why that gap turned out to be resolvable and 05.04
 * Educational Content's didn't. 05.04 is still deliberately not in this
 * list — it's still not built.
 */
export const PROGRAMS_SUB_NAV = [
  { label: "Programs", path: "/programs" },
  { label: "Exercises", path: "/programs/exercises" },
  { label: "Recipes", path: "/programs/recipes" },
  { label: "Review/Approval", path: "/programs/review-queue" },
];
