import { clearOwnedDraft, readOwnedDraft, writeOwnedDraft, type DraftOwner } from "./ownedDrafts";

/**
 * The AI Coach's unsent draft (Figma AI 02 "Unsent draft"): when a send fails
 * the text, its idempotency key and the time are kept locally so they survive
 * an app restart. The same `clientId` is reused on retry so the server never
 * stores the message twice. Stored per account (lib/ownedDrafts.ts): a draft,
 * and so its `clientId`, is only ever returned to the user who wrote it.
 */

export interface AiCoachDraft {
  text: string;
  clientId: string;
  savedAt: string;
}

export function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadDraft(owner: DraftOwner): Promise<AiCoachDraft | null> {
  const d = await readOwnedDraft<Partial<AiCoachDraft>>("aiCoach", owner);
  return d?.text && d.clientId && d.savedAt ? (d as AiCoachDraft) : null;
}

/** Local persistence is best-effort; the in-memory draft still works if it fails. */
export async function saveDraft(owner: DraftOwner, draft: AiCoachDraft): Promise<void> {
  await writeOwnedDraft("aiCoach", owner, draft);
}

export async function clearDraft(owner: DraftOwner): Promise<void> {
  await clearOwnedDraft("aiCoach", owner);
}
