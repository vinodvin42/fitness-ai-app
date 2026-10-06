import React, { createContext, useContext, useMemo } from "react";
import type { AccentColor } from "@fitness-ai-app/types";
import { useAuth } from "../context/AuthContext";
import { accentPalettes, colors } from "./tokens";

export type ThemeColors = Omit<typeof colors, "accent" | "accentSoft" | "textOnAccent"> & {
  accent: string;
  accentSoft: string;
  textOnAccent: string;
};

interface Theme {
  accentColor: AccentColor;
  colors: ThemeColors;
}

const defaultTheme: Theme = { accentColor: "blue", colors: { ...colors, ...accentPalettes.blue } };
const ThemeContext = createContext<Theme>(defaultTheme);

/** Swaps `accent`/`accentSoft`/`textOnAccent` live from the signed-in user's saved accent preference. Must sit inside AuthProvider. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const accentColor: AccentColor = user?.accentColor && user.accentColor in accentPalettes ? user.accentColor : "blue";
  const value = useMemo<Theme>(
    () => ({ accentColor, colors: { ...colors, ...accentPalettes[accentColor] } }),
    [accentColor],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Returns the live theme; components migrated to it read `colors.accent` etc. from here instead of the static tokens. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
