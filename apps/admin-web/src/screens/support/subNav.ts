/**
 * Shared contextual sub-panel for Module 08 — Support & Safety, added
 * 25 Aug 2026 once 08.02 Escalations joined 08.01 Support Tickets as a
 * second nav-level screen — same pattern as every other module's first
 * `subNav` (see AppShell.tsx's "21 Aug 2026" comment). 08.03 Complaints
 * and 08.04 Safety/Abuse Reports are deliberately not in this list — see
 * adminSupport.service.ts's own doc comment for why those two remain
 * genuinely unbuilt while Escalations turned out to be resolvable.
 */
export const SUPPORT_SUB_NAV = [
  { label: "Support Tickets", path: "/support" },
  { label: "Escalations", path: "/support/escalations" },
];
