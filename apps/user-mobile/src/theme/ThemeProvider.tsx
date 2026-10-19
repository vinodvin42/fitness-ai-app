import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccentColor } from "@fitness-ai-app/types";
import { useAuth } from "../context/AuthContext";
import { accentPalettes, applyTheme, colors, type Scheme, type ThemeMode } from "./tokens";

export type ThemeColors = typeof colors;

interface Theme {
  accentColor: AccentColor;
  colors: ThemeColors;
  /** What the user picked: follow the phone, or always light / dark. */
  mode: ThemeMode;
  /** What is showing now. */
  scheme: Scheme;
  /** Bumps on every scheme/accent change; RootNavigator keys its tree on it. */
  version: number;
  setMode: (mode: ThemeMode) => void;
}

const MODE_KEY = "fynrox.themeMode";

const ThemeContext = createContext<Theme>({
  accentColor: "blue",
  colors,
  mode: "system",
  scheme: "dark",
  version: 0,
  setMode: () => {},
});

/**
 * Owns the theme: scheme (Light / Dark / Same as phone, saved on the device)
 * and the user's saved accent. Applies both to the live `colors` token
 * object before children render. Must sit inside AuthProvider.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((v: string | null) => {
        if (v === "light" || v === "dark" || v === "system") setModeState(v);
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  }, []);

  const accentColor: AccentColor =
    user?.accentColor && user.accentColor in accentPalettes.dark ? user.accentColor : "blue";
  // Unknown system setting → dark, the look the app has shipped with.
  const scheme: Scheme = mode === "system" ? (system === "light" ? "light" : "dark") : mode;
  const version = useMemo(() => applyTheme(scheme, accentColor), [scheme, accentColor]);

  const value = useMemo<Theme>(
    () => ({ accentColor, colors: { ...colors }, mode, scheme, version, setMode }),
    [accentColor, mode, scheme, version, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Returns the live theme. Prefer this in new code; `colors` from tokens also stays current. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
