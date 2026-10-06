import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The AI Coach's unsent draft (Figma AI 02 "Unsent draft"): when a send fails
 * the text, its idempotency key and the time are kept locally so they survive
 * an app restart. The same `clientId` is reused on retry so the server never
 * stores the message twice.
 */
const KEY = "primefit.aiCoach.draft";

export interface AiCoachDraft {
  text: string;
  clientId: string;
  savedAt: string;
}

export function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadDraft(): Promise<AiCoachDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<AiCoachDraft>;
    return d.text && d.clientId && d.savedAt ? (d as AiCoachDraft) : null;
  } catch {
    return null;
  }
}

export async function saveDraft(draft: AiCoachDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Local persistence is best-effort; the in-memory draft still works.
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
