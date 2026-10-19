import { useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pruneDecisions, type SuggestionDecision, type SuggestionMode } from "./dailySuggestions";

/**
 * Daily review memory, on this device only (owner decision, 18 Oct 2026):
 * the Settings › Suggestions mode and the last two weeks of Use it / Skip
 * decisions. Same in-memory-cache + listeners shape as lib/localSettings.ts,
 * so Today, the review and Settings stay in step.
 */
const MODE_KEY = "primefit.dailyReview.mode";
const DECISIONS_KEY = "primefit.dailyReview.decisions";

let mode: SuggestionMode = "ask";
let decisions: SuggestionDecision[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
// Bumped on every change: useSyncExternalStore re-renders when it differs.
let stamp = 0;
const listeners = new Set<() => void>();
const emit = () => {
  stamp += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      const [m, d] = await Promise.all([AsyncStorage.getItem(MODE_KEY), AsyncStorage.getItem(DECISIONS_KEY)]);
      if (m === "ask" || m === "weekly" || m === "off") mode = m;
      const parsed = d ? (JSON.parse(d) as unknown) : [];
      if (Array.isArray(parsed)) decisions = pruneDecisions(parsed as SuggestionDecision[], new Date());
    } catch {
      /* storage unavailable or corrupt: keep the defaults */
    } finally {
      loaded = true;
      emit();
    }
  })();
  return loading;
}

export function setSuggestionMode(next: SuggestionMode) {
  mode = next;
  emit();
  AsyncStorage.setItem(MODE_KEY, next).catch(() => undefined);
}

export function recordSuggestionDecision(decision: SuggestionDecision) {
  decisions = pruneDecisions([...decisions.filter((d) => !(d.key === decision.key && d.date === decision.date)), decision], new Date());
  emit();
  AsyncStorage.setItem(DECISIONS_KEY, JSON.stringify(decisions)).catch(() => undefined);
}

/** `ready` is false until storage has been read, so nothing flashes on first render. */
export function useDailyReviewStore(): { ready: boolean; mode: SuggestionMode; decisions: readonly SuggestionDecision[] } {
  useEffect(() => {
    void load();
  }, []);
  useSyncExternalStore(
    subscribe,
    () => stamp,
    () => stamp,
  );
  return { ready: loaded, mode, decisions };
}

