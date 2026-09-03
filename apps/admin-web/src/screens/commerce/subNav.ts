/**
 * Shared contextual sub-panel for Module 06 — Commerce, added 25 Aug 2026
 * once 06.05 Pricing joined 06.03 Payments as a second nav-level screen
 * (06.02 Transaction detail is a row-click drill-down at "/commerce/:id",
 * not a nav destination, same as before). See AppShell.tsx's "21 Aug 2026"
 * comment for the pattern. 06.01 Subscriptions and 06.04 Refunds are
 * deliberately not in this list — see adminPayments.service.ts's own doc
 * comment for why they aren't built.
 */
// 31 Aug 2026: 06.05 Coupons (adminCoupons) and 06.04 Refunds (adminRefunds)
// join as real screens — the Coupon/Refund entities now exist. Only 06.01
// Subscriptions (Revenue waterfall) stays out — see adminPayments.service.ts.
export const COMMERCE_SUB_NAV = [
  { label: "Payments", path: "/commerce" },
  { label: "Pricing", path: "/commerce/plans" },
  { label: "Coupons", path: "/commerce/coupons" },
  { label: "Refunds", path: "/commerce/refunds" },
];
