/**
 * Design tokens for the mobile app (docs/mobile/04-design-system.md).
 *
 * 31 Aug 2026 â€” expanded into a fuller system (soft accent tints, a real
 * type scale, elevation, an extra spacing/radius step) as part of a design
 * polish pass. The original eyeballed values are preserved; new tokens are
 * additive so nothing that consumed the old set breaks.
 *
 * Accent is a swappable token (Preferences lets a user pick blue/green/
 * yellow/red â€” see AccentColor in packages/types); `colors.accent` is the
 * default. Soft/tint variants below are derived from the default blue.
 */

export const colors = {
  // Design System v2 (31 Aug 2026) — OLED-first "instrument panel". Deep
  // zinc base (not pure black), hairline translucent borders, and a mint-cyan
  // signature accent. See the published design-system spec. Neutrals carry a
  // faint cool bias toward the mint accent.
  background: "#0B0C10", // deep zinc, OLED-friendly
  surface: "#14161C",
  surfaceRaised: "#1B1E26",
  surfaceHigh: "#242833",
  border: "rgba(255,255,255,0.09)", // hairline
  borderStrong: "rgba(255,255,255,0.16)",

  textPrimary: "#EDF0F5",
  textSecondary: "#98A2B3",
  // Lightened from #5E6675 on 29 Sep 2026. A WCAG 2.1 AA contrast pass
  // over this palette measured it at 2.55:1 on `surfaceHigh` against a
  // 4.5:1 requirement — and it is used for exactly the text a low-vision
  // reader most needs (captions, hints, timestamps, the label under every
  // MacroChip). #8B919C is the smallest lightening that clears AA on the
  // worst surface, at 4.65:1. The same token, same value, was wrong in
  // apps/landing's CSS, which was ported from this file; axe-core found
  // 189 instances of it there.
  textMuted: "#8B919C",
  textOnAccent: "#04120E", // near-black green, for text on the mint accent

  accent: "#35E6C5", // signature mint-cyan (recovery/energy) — v2 headline
  accentAlt: "#0FB89A",
  accentSoft: "rgba(53,230,197,0.16)", // tinted well/chip background

  aiAccent: "#9B87FF", // refined violet for AI touchpoints
  aiAccentSoft: "rgba(155,135,255,0.16)",

  success: "#3FE08A",
  successSoft: "rgba(63,224,138,0.16)",
  warning: "#FFB020",
  warningSoft: "rgba(255,176,32,0.16)",
  danger: "#FF5064",
  dangerSoft: "rgba(255,80,100,0.16)",

  // Secondary/data hues — infrared (strain/streak/calories), pink (fat macro),
  // cyan (hydration/cardio).
  orange: "#FF6552", // "infrared" in the spec
  // #EC4899 measured 4.17:1 on `surfaceHigh` — under AA for normal text,
  // and it IS normal text: RecipeDetailScreen's MacroChip renders the fat
  // value in it at 18px, below the 18.66px large-text threshold. Nudged
  // the minimum needed to reach 4.62:1. The derived `rgba(236,72,153,.16)`
  // tints are untouched — those are backgrounds, held to 3:1 at most.
  pink: "#EE59A3",
  cyan: "#22D3EE",

  // Extra tints used by informational/permission/AI detail cards (Figma line).
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
 * the app (31 Aug 2026 â€” the onboarding wizard used 24px while tab screens
 * used 16px, which read as misaligned). `screenPadding` is the single
 * horizontal gutter; `maxContentWidth` centers content in a phone-width
 * column on wide/desktop viewports (a no-op on real phones).
 */
export const layout = {
  screenPadding: spacing.md,
  maxContentWidth: 600,
} as const;

/** Soft elevation for cards/sheets â€” subtle on a dark ground. */
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
 * stored default (DB default) and maps to the Fynrox brand mint accent; ThemeProvider swaps `accent`/`accentSoft`/`textOnAccent` live
 * from the user's saved preference.
 */
export const accentPalettes = {
  blue: { accent: colors.accent, accentSoft: colors.accentSoft, textOnAccent: colors.textOnAccent },
  green: { accent: "#34d399", accentSoft: "rgba(52,211,153,0.16)", textOnAccent: "#04120E" },
  yellow: { accent: "#FFB020", accentSoft: "rgba(255,176,32,0.16)", textOnAccent: "#1A1200" },
  red: { accent: "#FF5064", accentSoft: "rgba(255,80,100,0.16)", textOnAccent: "#FFFFFF" },
} as const;
