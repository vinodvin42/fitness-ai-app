/**
 * Shared contextual sub-panel for Module 07 — Growth, added 31 Aug 2026
 * once 07.01/07.02 Influencers joined 07.03 Referrals as a second real
 * screen — the "second screen triggers a subNav" pattern every other
 * multi-screen module in this console follows (see AppShell.tsx).
 *
 * **20 Sep 2026 (R2 Wave 4): 07.04 Campaigns & Attribution joins as two
 * real screens** (Campaign Directory + Acquisition Report) — this comment
 * used to say "no Campaign entity exists"; R2 Wave 1 (same day) built the
 * real `AcquisitionSource`/`Campaign`/`Touchpoint` schema + signup-time
 * resolution but shipped no UI. Screens live under
 * `apps/admin-web/src/screens/acquisition/` (a distinct directory — a
 * genuinely separate concern from Influencers/Referrals) but route/nav
 * under Growth, matching `docs/admin/03-screen-inventory.md`'s own
 * placement of 07.04 inside Module 07. See `apps/api/src/modules/
 * adminAcquisition/adminAcquisition.service.ts` for the real-vs-not
 * breakdown of what this actually reports. Influencer Payouts (Finance
 * 10.07) still live on the Influencers screen itself.
 */
export const GROWTH_SUB_NAV = [
  { label: "Referrals", path: "/growth" },
  { label: "Influencers", path: "/growth/influencers" },
  { label: "Campaigns", path: "/growth/campaigns" },
  { label: "Acquisition Report", path: "/growth/acquisition-report" },
  // Spec §8 (28 Sep 2026) — the public website's forms finally have a
  // queue an admin can work, rather than writing to a table nobody reads.
  { label: "Applications", path: "/growth/applications" },
];
