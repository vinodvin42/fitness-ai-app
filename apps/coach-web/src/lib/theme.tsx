import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Light / dark / system theme (owner, 26 Oct 2026: "give option to choose
 * dark and light theme"). The choice is kept per browser; "system" follows
 * the device and updates live when the device switches. index.html applies
 * the saved choice before first paint, so this only keeps it in step.
 */
export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "fynroxcoach.theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice): "light" | "dark" {
  const resolved = choice === "system" ? (media().matches ? "dark" : "light") : choice;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0a0a0a" : "#fafaf9");
  return resolved;
}

type ThemeContextValue = { choice: ThemeChoice; resolved: "light" | "dark"; setChoice: (c: ThemeChoice) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [resolved, setResolved] = useState<"light" | "dark">(() => apply(readChoice()));

  useEffect(() => {
    setResolved(apply(choice));
    if (choice !== "system") return;
    const m = media();
    const onChange = () => setResolved(apply("system"));
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // Private mode: the choice still applies for this visit.
    }
    setChoiceState(c);
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
