/**
 * Shared contextual sub-panel for the Gyms module, added 28 Sep 2026 once
 * Gym Help Requests joined the Directory as a second nav-level screen —
 * the same "add a subNav when a module gains a second destination"
 * convention every other module here follows (see AppShell.tsx's
 * "21 Aug 2026" comment).
 *
 * Gym Profile is deliberately absent: it is a row-click drill-down from
 * the Directory, not a destination someone navigates to cold, and listing
 * it would mean a nav item that cannot be clicked without first choosing
 * a gym.
 */
export const GYMS_SUB_NAV = [
  { label: "Directory", path: "/gyms" },
  { label: "Help Requests", path: "/gyms/help-requests" },
];
