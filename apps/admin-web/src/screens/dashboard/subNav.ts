/**
 * Shared contextual sub-panel for the Dashboard module, added R2 Wave 4
 * (20 Sep 2026) when "Action Required" joined the Executive Dashboard as a
 * second nav-level screen — same "subNav appears once a module ships more
 * than one screen" pattern every other module went through (see
 * AppShell.tsx's "21 Aug 2026" comment). Dashboard's own root route stays
 * "/" (unlike every other module, which roots at "/<module>") since that's
 * already the app's real landing route — "Action Required" sits alongside
 * it at "/action-required" rather than "/dashboard/action-required" to
 * avoid introducing a second, redundant root for the same module.
 */
export const DASHBOARD_SUB_NAV = [
  { label: "Overview", path: "/" },
  { label: "Action Required", path: "/action-required" },
];
