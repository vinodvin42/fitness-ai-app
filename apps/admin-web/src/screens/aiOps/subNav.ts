/**
 * Shared sub-panel for Module 11 — AI Operations (Oct 2026), once 11.02 AI
 * Usage joined the AI Coach on/off screen. Same pattern as the other
 * modules' subNav.ts files (see AppShell.tsx).
 */
// `module`: the permission the page's data needs; AppShell hides items the
// signed-in role can't open (see AppShell's canView).
export const AI_OPS_SUB_NAV = [
  { label: "AI Coach", path: "/ai-operations", module: "admin" },
  { label: "Usage", path: "/ai-operations/usage", module: "analytics" },
  // 11.03 AI Safety / Overrides (Oct 2026): reported answers + overrides log.
  { label: "Safety", path: "/ai-operations/safety", module: "sensitiveData" },
];
