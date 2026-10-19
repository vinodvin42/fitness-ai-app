import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Per-account local drafts (meal log, AI Coach), Oct 2026.
 *
 * - A draft is stored under its owner's user id and only returned to that user.
 * - Explicit sign-out and confirmed account deletion clear the outgoing user's drafts.
 * - Token refresh, network failure, session expiry and an ordinary password change clear nothing:
 *   the drafts stay owner-only until the same user signs in again.
 * - Legacy ownerless drafts are deleted, never restored or reassigned.
 *
 * Why cleanup cannot be undone by an in-flight write: every storage operation runs through one serial
 * queue, in call order, and ownership is checked when the operation RUNS, not when it was requested.
 * A cleanup is queued behind any write already running, so it executes after it; a write requested after
 * the cleanup sees the bumped epoch and is dropped.
 *
 * Storage failures: cleanup never throws, and sign-out waits for it for a bounded time only
 * (clearDraftsForSignOutWithin). A "pending clear" marker is saved first so the next start-up retries an
 * interrupted or failed cleanup. Until a cleanup has actually succeeded, that user's old drafts are treated as
 * unreadable (never shown, even to the same user), and their next save first completes the cleanup; the new
 * draft is persisted only after that succeeded. Other accounts can never read them in any case: keys are per user.
 *
 * Known trade-offs and limits:
 * - A corrupt marker (content this module did not write) cannot say whose cleanup is pending, so every meal and
 *   AI Coach draft on the device is removed, including drafts of users who had nothing pending. Drafts can be
 *   lost; they are never exposed. No other storage key is touched.
 * - Interrupted logout: if the marker cannot be read or written AND the draft removal fails, the obligation is
 *   kept in memory and recorded by the next successful marker update. If the app is killed before that, it is
 *   lost and the drafts stay on disk, readable only by their owner (as when the app dies before the marker is saved).
 */
export type DraftKind = "meal" | "aiCoach";
const PREFIX: Record<DraftKind, string> = { meal: "fynrox.draft.v2.meal:", aiCoach: "fynrox.draft.v2.aiCoach:" };
const PENDING_CLEAR_KEY = "fynrox.draft.v2.pendingClear";
const LEGACY_DRAFT_KEYS = ["logMeal.draft.v1", "primefit.aiCoach.draft"];

let activeUserId: string | null = null;
// In memory only: in-flight work cannot outlive the process.
const clearEpoch = new Map<string, number>();
// Users whose last requested cleanup has not been confirmed; their stored drafts are never returned.
const uncleared = new Set<string>();
const epochOf = (userId: string) => clearEpoch.get(userId) ?? 0;
const keyOf = (kind: DraftKind, userId: string) => PREFIX[kind] + userId;
const keysOf = (userId: string) => [keyOf("meal", userId), keyOf("aiCoach", userId)];

let queue: Promise<unknown> = Promise.resolve();
/** Runs storage work strictly one operation after another, in call order. A failure does not block later work. */
function serial<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op);
  queue = run.catch(() => undefined);
  return run;
}

/*
 * The pending-clear marker is one list of user ids, updated read-modify-write. A marker that cannot be read
 * (storage failure, or content this module did not write) is never treated as empty and never overwritten:
 * the update is abandoned instead, so entries this process cannot see are always kept.
 */
// The marker has been read and its entries handled in this process. Until then nobody's drafts are read or saved:
// any user might be listed in it.
let markerLoaded = false;
// Cleanups requested while the marker could not be updated; merged into it by the next successful update.
const unrecorded = new Set<string>();

// Tagged rather than an Error subclass: `instanceof` on Error subclasses is unreliable after class transpilation.
const corruptMarker = () => Object.assign(new Error("unreadable pending-clear marker"), { corruptMarker: true });
const isCorruptMarker = (e: unknown) => (e as { corruptMarker?: boolean } | null)?.corruptMarker === true;

async function readPendingOrThrow(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(PENDING_CLEAR_KEY); // a storage failure throws
  if (raw === null) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw corruptMarker();
  }
  if (!Array.isArray(list) || !list.every((x) => typeof x === "string")) throw corruptMarker();
  return list as string[];
}

/** Adds and removes entries; throws, writing nothing, if the current marker cannot be read. */
async function updatePending(add: string[], remove: string[]): Promise<void> {
  const current = await readPendingOrThrow();
  const next = Array.from(new Set([...current, ...unrecorded, ...add])).filter((id) => !remove.includes(id));
  if (next.length) await AsyncStorage.setItem(PENDING_CLEAR_KEY, JSON.stringify(next));
  else await AsyncStorage.removeItem(PENDING_CLEAR_KEY);
  unrecorded.clear();
}

/** Reads the marker and retries the cleanups it lists. Returns false, changing nothing, while it cannot be read. */
async function processMarker(): Promise<boolean> {
  let pending: string[];
  try {
    pending = await readPendingOrThrow();
  } catch (e) {
    if (!isCorruptMarker(e)) return false; // storage failure: retried by the next draft operation
    // Content we did not write: the listed users are unknowable, so meet every possible obligation by removing
    // every meal and AI Coach draft on this device (keys with exactly those two prefixes) and the marker itself.
    // Nothing else is touched: auth tokens, cached workouts, settings and all other keys survive.
    try {
      const keys = await AsyncStorage.getAllKeys();
      await AsyncStorage.multiRemove(keys.filter((k) => Object.values(PREFIX).some((p) => k.startsWith(p))));
      await AsyncStorage.removeItem(PENDING_CLEAR_KEY);
      unrecorded.clear(); // their drafts were among those removed
    } catch {
      return false;
    }
    markerLoaded = true;
    return true;
  }
  markerLoaded = true;
  if (pending.length) {
    pending.forEach((id) => uncleared.add(id));
    try {
      await AsyncStorage.multiRemove(pending.flatMap(keysOf));
      await updatePending([], pending); // re-reads, so entries added meanwhile are kept
      pending.forEach((id) => uncleared.delete(id));
    } catch {
      // the entries stay in the marker and in `uncleared`; retried at the next start, sign-out or save
    }
  }
  return true;
}

/** Draft operations run only once the marker has been read in this process (it is read at most once here). */
function ensureMarkerLoaded(): Promise<boolean> {
  return markerLoaded ? Promise.resolve(true) : processMarker();
}

/**
 * Start-up, before any user is set: retry interrupted cleanups, then delete legacy ownerless drafts. Never throws.
 * Safe to call again: every call re-reads the marker and retries what it lists.
 */
export function initDrafts(): Promise<void> {
  return serial(async () => {
    await processMarker();
    try {
      await AsyncStorage.multiRemove(LEGACY_DRAFT_KEYS);
    } catch {
      // retried on the next start; legacy drafts are never read by this module
    }
  }).catch(() => undefined);
}

/** Called by AuthContext whenever the signed-in user changes. */
export function setActiveDraftUser(userId: string | null): void {
  activeUserId = userId;
}

/** Captured when a save or send starts, so its late result can be checked against the owner. */
export interface DraftOwner {
  userId: string;
  epoch: number;
}
export function draftOwner(userId: string): DraftOwner {
  return { userId, epoch: epochOf(userId) };
}

interface Stored<T> {
  v: 2;
  userId: string;
  data: T;
}

export function readOwnedDraft<T>(kind: DraftKind, owner: DraftOwner): Promise<T | null> {
  return serial(async () => {
    const stillOwner = () =>
      activeUserId === owner.userId && epochOf(owner.userId) === owner.epoch && !uncleared.has(owner.userId);
    if (!(await ensureMarkerLoaded()) || !stillOwner()) return null;
    const raw = await AsyncStorage.getItem(keyOf(kind, owner.userId));
    if (!raw || !stillOwner()) return null; // account switched or owner signed out during the read
    const stored = JSON.parse(raw) as Stored<T>;
    if (stored?.v !== 2 || stored.userId !== owner.userId) {
      await AsyncStorage.removeItem(keyOf(kind, owner.userId));
      return null;
    }
    return stored.data;
  }).catch(() => null);
}

export function writeOwnedDraft<T>(kind: DraftKind, owner: DraftOwner, data: T): Promise<boolean> {
  return serial(async () => {
    // Checked when the write RUNS: any sign-out requested before this point has already bumped the epoch.
    if (epochOf(owner.userId) !== owner.epoch) return false;
    if (!(await ensureMarkerLoaded())) return false; // this user may be listed in a marker we cannot read yet
    // After a failed or interrupted cleanup: finish it BEFORE saving anything (remove both old drafts, then take
    // this user off the pending-clear marker). Saving first would let the next start-up's retry delete the new
    // draft. If either step fails, nothing is persisted (false): the caller's typed content exists in memory
    // only, and the old drafts stay unreadable.
    if (uncleared.has(owner.userId)) {
      await AsyncStorage.multiRemove(keysOf(owner.userId));
      await updatePending([], [owner.userId]);
      if (epochOf(owner.userId) !== owner.epoch) return false; // signed out meanwhile: that cleanup runs next
      uncleared.delete(owner.userId);
    }
    const stored: Stored<T> = { v: 2, userId: owner.userId, data };
    await AsyncStorage.setItem(keyOf(kind, owner.userId), JSON.stringify(stored));
    return true;
  }).catch(() => false);
}

export function clearOwnedDraft(kind: DraftKind, owner: DraftOwner): Promise<void> {
  return serial(() => AsyncStorage.removeItem(keyOf(kind, owner.userId))).catch(() => undefined);
}

/** How long explicit sign-out and account deletion wait for draft cleanup before continuing. */
export const SIGN_OUT_CLEANUP_WAIT_MS = 3000;

/**
 * For explicit sign-out and confirmed account deletion: waits for clearDraftsForSignOut at most `maxWaitMs`, then
 * returns so the caller can move on to its next step. Only this draft-cleanup step is bounded: the rest of the
 * caller's sign-out flow is not. Resolves `true` only if the drafts were removed within the wait; `false` means cleanup
 * is NOT confirmed (it failed, or storage has not answered yet). A timeout cancels nothing: the cleanup stays in
 * the queue and still runs, in order, if storage answers later. The queue itself is never timed out or skipped,
 * since that would let a hung write land after a later cleanup.
 *
 * Old-account exposure does not depend on the wait: the epoch bump, the "uncleared" mark and dropping the active
 * user happen synchronously when cleanup is requested, so from that moment the user's drafts are unreadable and
 * their later-running writes are dropped, whether or not storage ever answers.
 *
 * If storage stays hung for the rest of the process, every later draft operation, for any account, waits behind
 * the hung one: reads return no draft, writes are not persisted, clears do not complete, and callers that await
 * them wait too. A later sign-out again continues after `maxWaitMs`. After a restart the queue is gone; initDrafts
 * retries the cleanup if its marker was saved. If the marker was never saved, the old drafts stay on disk under
 * their owner's key, readable only by that same account.
 */
export function clearDraftsForSignOutWithin(userId: string, maxWaitMs = SIGN_OUT_CLEANUP_WAIT_MS): Promise<boolean> {
  const cleanup = clearDraftsForSignOut(userId); // requested synchronously: exposure is already prevented
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), maxWaitMs);
  });
  return Promise.race([cleanup, timedOut]).finally(() => clearTimeout(timer));
}

/**
 * Requests cleanup of the outgoing user's drafts. Never throws, but waits as long as storage does: a storage call
 * that never settles means this never resolves. Sign-out paths therefore use clearDraftsForSignOutWithin.
 * Resolves `true` only when the drafts were actually removed from storage.
 */
export function clearDraftsForSignOut(userId: string): Promise<boolean> {
  clearEpoch.set(userId, epochOf(userId) + 1); // synchronous: later-running writes for this owner are dropped
  if (activeUserId === userId) activeUserId = null;
  uncleared.add(userId);
  return serial(async () => {
    await ensureMarkerLoaded(); // best effort: retries cleanups listed by an earlier unreadable marker
    try {
      await updatePending([userId], []);
    } catch {
      // marker unreadable or unwritable: never overwritten; this entry is merged in by the next successful update
      unrecorded.add(userId);
    }
    try {
      await AsyncStorage.multiRemove([...keysOf(userId), ...LEGACY_DRAFT_KEYS]);
    } catch {
      return false; // marker (if saved) stays; initDrafts retries; drafts stay unreadable meanwhile
    }
    unrecorded.delete(userId);
    try {
      await updatePending([], [userId]);
      uncleared.delete(userId);
    } catch {
      // drafts are removed but the marker still lists this user: stay "uncleared", so their next save first
      // retries the marker update instead of saving a draft the next start-up would delete
    }
    return true;
  }).catch(() => false);
}
