/**
 * Shared contextual sub-panel for Module 10 — Finance, added 26 Aug 2026
 * — same pattern as every other module's first `subNav` (see
 * AppShell.tsx's "21 Aug 2026" comment). 7 of the Figma's 10 destinations
 * are real. **31 Aug 2026: 10.06 Coach Settlements joins** — unblocked once
 * the take-rate decision was made (configurable per-coach commission). 10.07
 * Influencer Payouts lives under Growth → Influencers (managed alongside the
 * Influencer directory), and 10.09 Bank/Payment Accounts stays out (needs a
 * real banking-aggregation vendor) — same "no dead links, omit rather than
 * stub" convention. See adminSettlements.service.ts's own doc comment.
 */
export const FINANCE_SUB_NAV = [
  { label: "Dashboard", path: "/finance" },
  { label: "Revenue", path: "/finance/revenue" },
  { label: "Expenses & Payouts", path: "/finance/expenses" },
  { label: "Settlements", path: "/finance/settlements" },
  { label: "Invoices", path: "/finance/invoices" },
  { label: "Receivables & Payables", path: "/finance/receivables-payables" },
  { label: "Taxes & Compliance", path: "/finance/taxes" },
  { label: "Financial Reports", path: "/finance/reports" },
];
