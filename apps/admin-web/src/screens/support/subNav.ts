/**
 * Shared contextual sub-panel for Module 08 — Support & Safety, added
 * 25 Aug 2026 once 08.02 Escalations joined 08.01 Support Tickets as a
 * second nav-level screen — same pattern as every other module's first
 * `subNav` (see AppShell.tsx's "21 Aug 2026" comment). 08.03 Complaints
 * and 08.04 Safety/Abuse Reports are deliberately not in this list — see
 * adminSupport.service.ts's own doc comment for why those two remain
 * genuinely unbuilt while Escalations turned out to be resolvable.
 *
 * **18 Sep 2026: Safety Escalations joined as a third row** — BR-SAF-004's
 * real queue (`SafetyEscalation`, see adminSafety.service.ts), distinct
 * from 08.02 Escalations above (a support-ticket workflow annotation) —
 * this one is triggered server-side from a user's own assessment
 * completion, not raised by an admin against a ticket.
 */
export const SUPPORT_SUB_NAV = [
  { label: "Support Tickets", path: "/support" },
  { label: "Escalations", path: "/support/escalations" },
  { label: "Safety Escalations", path: "/support/safety-escalations" },
];
