/**
 * Design tokens observed in docs/coach/04-design-system.md. No Figma
 * variables were published for this file either (§1) — these are eyeballed
 * approximations from rendered screenshots, not a locked spec. Confirm
 * exact values with design before shipping.
 *
 * Accent is the coach app's own **lime/yellow-green** (`#D4FF00`–`#C6F000`,
 * §1) — deliberately left different from admin-web's mint and user-mobile's
 * blue. docs/coach/07-open-questions-gaps.md §3 flags all three as likely
 * unintentional drift, but unifying them is a real design decision, not an
 * engineering call to make unilaterally — see that gap doc's "20 Aug 2026"
 * entry. Every other token below otherwise mirrors user-mobile's shape
 * exactly, so a future shared `packages/ui` token set has an easy merge.
 */

export const colors = {
  background: "#0B0B0F",
  surface: "#17171D",
  surfaceRaised: "#1F1F27",
  border: "#2A2A33",

  textPrimary: "#F5F5F7",
  textSecondary: "#9A9AA5",
  textMuted: "#65656F",

  accent: "#D4FF00",
  accentAlt: "#C6F000",

  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  card: 16,
  pill: 999,
  sm: 8,
} as const;

export const typography = {
  metricLarge: { fontSize: 40, fontWeight: "700" as const },
  h1: { fontSize: 24, fontWeight: "700" as const },
  h2: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  meta: { fontSize: 12, fontWeight: "400" as const },
};
