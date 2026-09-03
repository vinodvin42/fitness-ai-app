/**
 * Shared contextual sub-panel for Module 07 — Growth, added 31 Aug 2026
 * once 07.01/07.02 Influencers joined 07.03 Referrals as a second real
 * screen — the "second screen triggers a subNav" pattern every other
 * multi-screen module in this console follows (see AppShell.tsx). 07.04
 * Campaigns & Attribution stays out — no Campaign entity exists (there's
 * no ad/UTM attribution pipeline anywhere in this build), same "omit
 * rather than stub" convention. Influencer Payouts (Finance 10.07) live on
 * the Influencers screen itself, managed alongside each influencer.
 */
export const GROWTH_SUB_NAV = [
  { label: "Referrals", path: "/growth" },
  { label: "Influencers", path: "/growth/influencers" },
];
