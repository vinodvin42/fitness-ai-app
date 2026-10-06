/**
 * Design tokens for the mobile app (docs/mobile/04-design-system.md).
 *
 * 31 Aug 2026 — expanded into a fuller system (soft accent tints, a real
 * type scale, elevation, an extra spacing/radius step) as part of a design
 * polish pass. The original eyeballed values are preserved; new tokens are
 * additive so nothing that consumed the old set breaks.
 *
 * Accent is a swappable token (Preferences lets a user pick blue/green/
 * yellow/red — see AccentColor in packages/types); `colors.accent` is the
 * default. Soft/tint variants below are derived from the default blue.
 */

export const colors = {
  // Design System v2 (31 Aug 2026) — OLED-first "instrument panel". Deep
  // zinc base (not pure black), hairline translucent borders, and a mint-cyan
  // signature accent. See the published design-system spec. Neutrals carry a
  // faint cool bias toward the mint accent.
  background: "#09090b", // Figma background/canvas
  surface: "#121215", // Figma surface/card
  surfaceRaised: "#1B1B20",
  surfaceHigh: "#27272a", // Figma surface/muted
  border: "#27272a", // Figma border/subtle
  borderStrong: "rgba(255,255,255,0.16)",

  textPrimary: "#f4f4f5", // Figma text/primary
  textSecondary: "#b0b8c6", // Figma text/secondary
  textMuted: "#5E6675",
  textOnAccent: "#FFFFFF", // Figma text/on-accent

  accent: "#2563eb", // Figma action/primary (default "blue" accent)
  accentAlt: "#1D4ED8",
  accentSoft: "rgba(37,99,235,0.12)", // Figma action/primary/subtle

  aiAccent: "#a78bfa", // Figma ai/accent
  aiAccentSoft: "rgba(167,139,250,0.14)",

  success: "#34d399", // Figma status/success
  successSoft: "rgba(52,211,153,0.16)",
  warning: "#fbbf24", // Figma status/warning
  warningSoft: "rgba(251,191,36,0.12)",
  danger: "#fb7185", // Figma status/error
  dangerSoft: "rgba(251,113,133,0.12)",

  // Secondary/data hues — infrared (strain/streak/calories), pink (fat macro),
  // cyan (hydration/cardio).
  orange: "#FF6552", // "infrared" in the spec
  pink: "#EC4899",
  cyan: "#22D3EE",

  // Figma "observed" tints used by informational/permission detail cards.
  infoSurface: "#101c30",
  infoBorder: "#24436e",
  aiSurface: "#1c152e",
  aiBorder: "#3f2d65",

  overlay: "rgba(0,0,0,0.6)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  card: 18, // mobile cards are generously rounded, touch-first
  lg: 24,
  pill: 999,
} as const;

/**
 * Font families (Design System v2). Loaded in App.tsx via @expo-google-fonts.
 * Each Google font weight is its own family string; the family carries the
 * weight, so styles set `fontFamily` and omit `fontWeight`. Exposed here so
 * screens can reach for the display or mono face inline (e.g. metric numbers)
 * beyond the typography scale below.
 */
export const fonts = {
  display: "Sora_800ExtraBold",
  displayBold: "Sora_700Bold",
  displaySemi: "Sora_600SemiBold",
  body: "Manrope_400Regular",
  bodyMedium: "Manrope_500Medium",
  bodySemi: "Manrope_600SemiBold",
  bodyBold: "Manrope_700Bold",
  mono: "JetBrainsMono_700Bold",
  monoSemi: "JetBrainsMono_600SemiBold",
} as const;

export const typography = {
  display: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -0.5 },
  metricLarge: { fontFamily: fonts.mono, fontSize: 40, letterSpacing: -1 },
  h1: { fontFamily: fonts.displayBold, fontSize: 26, letterSpacing: -0.4 },
  h2: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: -0.2 },
  h3: { fontFamily: fonts.displaySemi, fontSize: 15 },
  body: { fontFamily: fonts.body, fontSize: 15 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13 },
  meta: { fontFamily: fonts.body, fontSize: 12 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 0.3 },
};

/**
 * Layout constants shared by every screen shell so gutters line up across
 * the app (31 Aug 2026 — the onboarding wizard used 24px while tab screens
 * used 16px, which read as misaligned). `screenPadding` is the single
 * horizontal gutter; `maxContentWidth` centers content in a phone-width
 * column on wide/desktop viewports (a no-op on real phones).
 */
export const layout = {
  screenPadding: spacing.md,
  maxContentWidth: 600,
} as const;

/** Soft elevation for cards/sheets — subtle on a dark ground. */
export const elevation = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  floating: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} as const;

/**
 * Per-preference accent palette (AccentColor in packages/types). `blue` is the
 * Figma default; ThemeProvider swaps `accent`/`accentSoft`/`textOnAccent` live
 * from the user's saved preference.
 */
export const accentPalettes = {
  blue: { accent: "#2563eb", accentSoft: "rgba(37,99,235,0.12)", textOnAccent: "#FFFFFF" },
  green: { accent: "#34d399", accentSoft: "rgba(52,211,153,0.16)", textOnAccent: "#04120E" },
  yellow: { accent: "#FFB020", accentSoft: "rgba(255,176,32,0.16)", textOnAccent: "#1A1200" },
  red: { accent: "#FF5064", accentSoft: "rgba(255,80,100,0.16)", textOnAccent: "#FFFFFF" },
} as const;
