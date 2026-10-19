/**
 * Design tokens for the mobile app.
 *
 * 16 Oct 2026 — values now come from the approved Figma variables
 * (v1-user file, page "00 — FynroX Design System", Dark and Light modes).
 * See docs/mobile/08-component-audit.md for the mapping and the audit that
 * led here. Key names are unchanged so every screen keeps working.
 *
 * Theming: `colors` is ONE live object. `applyTheme()` rewrites its values
 * for the chosen scheme (light/dark) and accent, and bumps `themeVersion`.
 * ThemeProvider calls it and remounts the navigation tree, so inline styles
 * that read `colors.x` at render time pick up the change. Anything built
 * once at module load (StyleSheet.create, tone maps) must be wrapped in
 * `themed(() => …)` so it is rebuilt for the current theme.
 */

export type Scheme = "light" | "dark";
export type ThemeMode = "system" | Scheme;
export type AccentKey = "blue" | "green" | "yellow" | "red";

type Palette = {
  background: string; surface: string; surfaceRaised: string; surfaceHigh: string;
  border: string; borderStrong: string;
  textPrimary: string; textSecondary: string; textMuted: string; textOnAccent: string;
  accent: string; accentAlt: string; accentSoft: string; accentText: string;
  aiAccent: string; aiAccentSoft: string; aiText: string;
  success: string; successSoft: string; successText: string;
  warning: string; warningSoft: string; warningText: string;
  danger: string; dangerSoft: string; dangerText: string;
  dataProtein: string; dataCarbs: string; dataFat: string;
  orange: string; pink: string; cyan: string;
  infoSurface: string; infoBorder: string; aiSurface: string; aiBorder: string;
  brandNavy: string; brandMark: string;
  overlay: string;
  /** Material state layer for pressed feedback / android_ripple. */
  ripple: string;
  /** Focus indicator ring (keyboard / switch access). Fixed blue so it never reads as an error, whatever the accent. */
  focus: string;
  /** Outline of controls whose edge is their only identifier: text inputs, off switches, empty radios/checkboxes (WCAG 1.4.11, >= 3:1). */
  outline: string;
};

/**
 * Figma variable → token. Values marked (derived) are not Figma variables:
 * they are the nearest colour that meets WCAG 2.1 AA (4.5:1) for small text
 * on every surface in that mode, and need design sign-off (audit §3).
 */
export const palettes: Record<Scheme, Palette> = {
  dark: {
    background: "#12171a", // background/canvas
    surface: "#1c252a", // surface/card
    surfaceRaised: "#25353f", // surface/raised
    surfaceHigh: "#2c373d", // surface/muted
    border: "#2c373d", // border/subtle
    borderStrong: "#3d4b52", // (derived) border/subtle, one step up
    textPrimary: "#ffffff", // text/primary
    textSecondary: "#b0b8c6", // text/secondary
    textMuted: "#93a0ab", // (derived) 4.57:1 on surface/muted
    textOnAccent: "#04121c", // text/on-accent
    accent: "#0090e0", // action/primary
    accentAlt: "#0077c2",
    accentSoft: "rgba(0,144,224,0.16)",
    accentText: "#5cbaf0", // (derived) >= 4.5:1 as small text on card, raised, muted and its own soft tint
    aiAccent: "#a78bfa", // ai/accent
    aiAccentSoft: "rgba(167,139,250,0.16)",
    aiText: "#bba7fc", // (derived) >= 4.5:1 as small text on card, raised, muted and its own soft tint
    success: "#00f098", // status/success
    successSoft: "rgba(0,240,152,0.14)",
    successText: "#00f098",
    warning: "#e89820", // status/warning
    warningSoft: "rgba(232,152,32,0.16)",
    warningText: "#f0a63a", // (derived) >= 4.5:1 as small text on card, raised, muted and its own soft tint
    danger: "#fb7185", // status/error
    dangerSoft: "rgba(251,113,133,0.16)",
    dangerText: "#fe97a6", // (derived) >= 4.5:1 as small text on card, raised, muted and its own soft tint
    dataProtein: "#60a5fa", // data/protein
    dataCarbs: "#2dd4bf", // data/carbs
    dataFat: "#a5b4fc", // data/fat
    orange: "#ff7a59",
    pink: "#f472b6",
    cyan: "#22d3ee",
    infoSurface: "#13263a",
    infoBorder: "#24436e",
    aiSurface: "#1e1833",
    aiBorder: "#3f2d65",
    brandNavy: "#132b4b", // brand/navy
    brandMark: "#ffffff", // brand/mark (logo on dark)
    overlay: "rgba(0,0,0,0.6)",
    ripple: "rgba(255,255,255,0.10)", // (derived) Material pressed state layer
    focus: "#5cbaf0", // (derived) >= 3:1 on canvas, card, raised and muted
    outline: "#748390", // (derived) >= 3:1 on canvas, card, raised and muted
  },
  light: {
    background: "#f4f7f9",
    surface: "#ffffff",
    surfaceRaised: "#ebf0f3", // (derived) Figma light has no separate raised step (raised = card white), so insets inside cards vanished; sits between canvas and muted
    surfaceHigh: "#e3ebf0",
    border: "#d5dee3",
    borderStrong: "#b8c5cc",
    textPrimary: "#12171a",
    textSecondary: "#3f4e54",
    textMuted: "#5c6b72", // (derived) 4.58:1 on surface/muted
    textOnAccent: "#ffffff",
    accent: "#0077c2",
    accentAlt: "#005f9b",
    accentSoft: "rgba(0,119,194,0.10)", // action/primary/subtle
    accentText: "#00609e", // (derived) >= 4.5:1 as small text on card, raised, muted and its own soft tint
    aiAccent: "#6d28d9",
    aiAccentSoft: "rgba(109,40,217,0.10)",
    aiText: "#6d28d9", // ai/accent already passes
    success: "#00875f",
    successSoft: "rgba(0,135,95,0.10)",
    successText: "#006f4f", // (derived) >= 4.5:1 as small text on card, raised, muted and its own soft tint
    warning: "#b26b00",
    warningSoft: "rgba(178,107,0,0.12)",
    warningText: "#875100", // (derived) >= 4.5:1 as small text on card, raised, muted and its own soft tint
    danger: "#be123c", // (derived) no light status/error variable published
    dangerSoft: "rgba(190,18,60,0.10)",
    dangerText: "#b0103a", // (derived) >= 4.5:1 as small text on card, raised, muted and its own soft tint
    dataProtein: "#2563eb", // (derived) data colours on white
    dataCarbs: "#0f766e",
    dataFat: "#4f46e5",
    orange: "#c2410c",
    pink: "#be185d",
    cyan: "#0e738f", // (derived) was #0e7490 at 4.44:1 on surfaceHigh; same hue, 0.2% darker for 4.5:1 (it's used as text: ActivityTracker pace)
    infoSurface: "#eaf4fb",
    infoBorder: "#b7d6ee",
    aiSurface: "#f3effd",
    aiBorder: "#d6c8f5",
    brandNavy: "#132b4b",
    brandMark: "#000000", // brand/mark (logo on light)
    overlay: "rgba(18,23,26,0.45)",
    ripple: "rgba(18,23,26,0.08)", // (derived) Material pressed state layer
    focus: "#00609e", // (derived) >= 3:1 on canvas, card, raised and muted
    outline: "#6f7f8a", // (derived) >= 3:1 on canvas, card, raised and muted
  },
};

/** Accent Colour preference (Figma settings/06). `blue` is the brand action colour. */
export const accentPalettes: Record<Scheme, Record<AccentKey, { accent: string; accentSoft: string; accentText: string; textOnAccent: string }>> = {
  dark: {
    blue: { accent: palettes.dark.accent, accentSoft: palettes.dark.accentSoft, accentText: palettes.dark.accentText, textOnAccent: palettes.dark.textOnAccent },
    green: { accent: "#34d399", accentSoft: "rgba(52,211,153,0.16)", accentText: "#34d399", textOnAccent: "#04121c" },
    yellow: { accent: "#fbbf24", accentSoft: "rgba(251,191,36,0.16)", accentText: "#fbbf24", textOnAccent: "#1a1200" },
    red: { accent: "#fb7185", accentSoft: "rgba(251,113,133,0.16)", accentText: "#fe97a6", textOnAccent: "#2a0710" },
  },
  light: {
    blue: { accent: palettes.light.accent, accentSoft: palettes.light.accentSoft, accentText: palettes.light.accentText, textOnAccent: palettes.light.textOnAccent },
    green: { accent: "#047857", accentSoft: "rgba(4,120,87,0.10)", accentText: "#03684b", textOnAccent: "#ffffff" },
    yellow: { accent: "#a16207", accentSoft: "rgba(161,98,7,0.12)", accentText: "#875100", textOnAccent: "#ffffff" },
    red: { accent: "#be123c", accentSoft: "rgba(190,18,60,0.10)", accentText: "#b0103a", textOnAccent: "#ffffff" },
  },
};

/** The live colour object every screen reads. Starts dark until ThemeProvider applies the user's choice. */
export const colors: Palette = { ...palettes.dark };

let themeVersion = 0;
let currentScheme: Scheme = "dark";

/** Rewrites `colors` for a scheme + accent. Returns the new version number. */
export function applyTheme(scheme: Scheme, accent: AccentKey = "blue"): number {
  const changed = scheme !== currentScheme || colors.accent !== accentPalettes[scheme][accent].accent;
  Object.assign(colors, palettes[scheme], accentPalettes[scheme][accent]);
  currentScheme = scheme;
  if (changed) themeVersion += 1;
  return themeVersion;
}
export function getThemeVersion(): number {
  return themeVersion;
}
export function getScheme(): Scheme {
  return currentScheme;
}

/**
 * Wraps a value built from `colors` at module load (StyleSheet.create,
 * tone/status maps) so it is rebuilt whenever the theme changes. Reads stay
 * `styles.card`, `TONES.success` — no call-site changes.
 */
export function themed<T extends object>(factory: () => T): T {
  let cache: T | null = null;
  let builtFor = -1;
  const resolve = (): T => {
    if (cache === null || builtFor !== themeVersion) {
      cache = factory();
      builtFor = themeVersion;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_t, key) => (resolve() as Record<string | symbol, unknown>)[key],
    has: (_t, key) => key in resolve(),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_t, key) => {
      const d = Object.getOwnPropertyDescriptor(resolve(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  xs: 4, // radius/4
  sm: 8, // radius/8
  md: 12, // radius/12
  card: 16, // radius/16
  lg: 20, // radius/20
  pill: 999, // radius/100
} as const;

/** Minimum touch target (Material: 48dp). Smaller visuals get hitSlop up to this. */
export const touch = { min: 48 } as const;

/**
 * Inter, as in the Figma type styles. Each weight is its own family string
 * (loaded in App.tsx via @expo-google-fonts/inter), so styles set
 * `fontFamily` and omit `fontWeight`. Hindi text falls back to the system
 * Noto Sans Devanagari on Android.
 */
export const fonts = {
  display: "Inter_800ExtraBold",
  displayBold: "Inter_700Bold",
  displaySemi: "Inter_600SemiBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "Inter_800ExtraBold", // metrics: Inter with tabular figures
  monoSemi: "Inter_600SemiBold",
} as const;

/**
 * Type scale. Sizes follow the 15 Oct 2026 readability rule (body 16,
 * nothing under 13) with Material roles alongside. Validated on
 * representative screens before rollout (audit §5).
 */
export const typography = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  metricLarge: { fontFamily: fonts.mono, fontSize: 40, lineHeight: 46, letterSpacing: -1, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  h1: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 }, // Material title-large+
  h2: { fontFamily: fonts.displayBold, fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  h3: { fontFamily: fonts.displaySemi, fontSize: 16, lineHeight: 22 }, // title-medium
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 }, // body-large
  bodySmall: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 }, // body-medium
  label: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20 }, // label-large
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, letterSpacing: 0.4 },
  /** Bottom navigation label (Material label-medium). Shared by MainTabs and the component kit. */
  tabLabel: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 16, letterSpacing: 0 },
};

export const layout = {
  screenPadding: spacing.md,
  maxContentWidth: 600,
} as const;

/** Elevation: soft on light, deeper on dark. Read at render time via `themed`. */
export const elevation = themed(() => ({
  card:
    currentScheme === "dark"
      ? { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 }
      : { shadowColor: "#12171a", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  floating:
    currentScheme === "dark"
      ? { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 }
      : { shadowColor: "#12171a", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
}));
