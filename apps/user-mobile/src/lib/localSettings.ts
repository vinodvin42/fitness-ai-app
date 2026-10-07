import { useEffect, useSyncExternalStore } from "react";
import { Text, TextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Per-device boolean settings (AsyncStorage) for the Settings hub toggles that
 * are not account data: Larger text and Real-time HR sync. Each key keeps an
 * in-memory copy so every screen reading it re-renders on change.
 */
const PREFIX = "primefit.setting.";
const cache = new Map<string, boolean>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

async function load(key: string) {
  if (cache.has(key) || loading.has(key)) return;
  loading.add(key);
  try {
    const v = await AsyncStorage.getItem(PREFIX + key);
    if (v === "1" || v === "0") {
      cache.set(key, v === "1");
      emit();
    }
  } catch {
    /* storage unavailable: keep the default */
  } finally {
    loading.delete(key);
  }
}

export function setLocalFlag(key: string, value: boolean) {
  cache.set(key, value);
  emit();
  AsyncStorage.setItem(PREFIX + key, value ? "1" : "0").catch(() => undefined);
  if (key === LARGER_TEXT_KEY) applyTextScale(value);
}

export function useLocalFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  useEffect(() => {
    void load(key);
  }, [key]);
  const value = useSyncExternalStore(
    subscribe,
    () => cache.get(key) ?? fallback,
    () => fallback,
  );
  return [value, (v: boolean) => setLocalFlag(key, v)];
}

export const LARGER_TEXT_KEY = "largerText";
export const HR_SYNC_KEY = "hrSync";

/**
 * Larger text. React Native already scales text with the device's font-size
 * setting; this switch only sets how far the app follows it. ON (default):
 * follow the device up to 1.5x. OFF: keep the app's own sizes (1x). Applied
 * through Text/TextInput defaultProps, so it takes effect on the next render
 * of each text node and needs no theme refactor.
 */
export function applyTextScale(larger: boolean) {
  const max = larger ? 1.5 : 1;
  for (const C of [Text, TextInput] as Array<{ defaultProps?: Record<string, unknown> }>) {
    C.defaultProps = { ...(C.defaultProps ?? {}), allowFontScaling: true, maxFontSizeMultiplier: max };
  }
}

/** Call once at startup: applies the saved Larger text choice (default ON). */
export async function initTextScale() {
  applyTextScale(true);
  try {
    const v = await AsyncStorage.getItem(PREFIX + LARGER_TEXT_KEY);
    if (v === "0" || v === "1") {
      cache.set(LARGER_TEXT_KEY, v === "1");
      applyTextScale(v === "1");
      emit();
    }
  } catch {
    /* keep default */
  }
}
