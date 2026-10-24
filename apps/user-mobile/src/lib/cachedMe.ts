import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@fitness-ai-app/types";

/**
 * The signed-in member as last loaded (24 Oct 2026), so the app can open
 * without a connection: start-up keeps the member signed in after a network
 * error and shows this copy until the server answers (Figma today/08, needed
 * for offline set logging after a restart). Only a real refusal from the
 * server (401/403) signs out. Cleared at sign-out. Check:
 * tests/cachedMe.check.cjs.
 */
const KEY = "fynrox.cachedMe.v1";

export interface CachedMe {
  user: User;
  onboardingCompleted: boolean;
}

export async function saveCachedMe(me: CachedMe): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(me));
  } catch {
    // Storage unavailable: an offline start just shows the sign-in screen, as before.
  }
}

export async function loadCachedMe(): Promise<CachedMe | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<CachedMe>) : null;
    return v && v.user && typeof v.user.id === "string" ? { user: v.user, onboardingCompleted: !!v.onboardingCompleted } : null;
  } catch {
    return null;
  }
}

export async function clearCachedMe(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** True only when the server answered and refused the sign-in, not for a lost connection or a server error. */
export function isAuthRejection(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403;
}
