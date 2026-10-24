import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import type { QueryClient } from "@tanstack/react-query";
import type { ExerciseSetLog, LogSetInput, UpdateSetInput, WorkoutSession } from "@fitness-ai-app/types";
import {
  deleteWorkoutSet,
  fetchWorkoutSession,
  logWorkoutSet,
  updateSessionProgress,
  updateWorkoutSet,
} from "../api/workoutSessions";
import { withSetLog } from "./setNumbering";
import {
  EMPTY_QUEUE,
  clearRejected,
  drainQueue,
  editQueuedSet,
  enqueueSet,
  hasQueuedSet,
  hasQueuedWork,
  isLocalSetId,
  isNoResponse,
  itemsFor,
  newLocalSetId,
  parseQueue,
  pendingRow,
  queueDelete,
  queueEdit,
  queueProgress,
  rejectedFor,
  removeQueuedSet,
  waitingSetCount,
  withQueuedChanges,
  type DrainResult,
  type OfflineQueue,
  type QueueItem,
  type QueuedSet,
  type RejectedSet,
} from "./offlineSetQueue";

/**
 * Offline set logging (Figma today/08, 24 Oct 2026): the queue on this phone. The rules are in
 * lib/offlineSetQueue.ts; this file keeps the queue in AsyncStorage, tells the screens about it and sends it when
 * the connection is back (components/OfflineSetSync.tsx starts it once, under the signed-in user).
 *
 * - A set goes straight to the server when the phone is online and nothing is waiting for that workout. With no
 *   connection (NetInfo), or when the request gets no answer within LIVE_TIMEOUT_MS, it is queued instead. A server
 *   error that did answer is still shown as an error.
 * - Once something is waiting for a workout, later sets, edits and the exercise index for it are queued behind it, so
 *   everything reaches the server in the order it happened.
 * - The queue is sent when NetInfo reports a connection, when the app comes to the front, after a queued save while
 *   online, and on a back-off timer after a failed attempt.
 * - Items carry the user id: another account signed in on this phone never sees or sends them. They stay after
 *   sign-out and are sent when that member signs back in (dropped after 14 days, QUEUE_MAX_AGE_MS).
 */

const STORAGE_KEY = "fynrox.offlineSets.v1";
/** A live save that hasn't answered by then is kept on the phone instead (it may still reach the server; see sameSet). */
const LIVE_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000];

let queue: OfflineQueue = EMPTY_QUEUE;
let loaded = false;
let loading: Promise<void> | null = null;
let userId: string | null = null;
let online = true;
let syncing = false;
let draining: Promise<DrainResult | null> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let client: QueryClient | null = null;
let notifyRejected: ((rejected: RejectedSet[]) => void) | null = null;
/** Local ids of waiting sets that have synced → their server ids, for an edit sheet still open on the old row. */
const syncedIds = new Map<string, string>();

let stamp = 0;
const listeners = new Set<() => void>();
const emit = () => {
  stamp += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= (async () => {
    try {
      queue = parseQueue(await AsyncStorage.getItem(STORAGE_KEY), new Date());
    } catch {
      /* storage unreadable: start empty */
    } finally {
      loaded = true;
      emit();
    }
  })();
  return loading;
}

function write(next: OfflineQueue) {
  if (next === queue) return;
  queue = next;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
}

function base(uid: string, sessionId: string) {
  return { userId: uid, sessionId, queuedAt: new Date().toISOString() };
}

/** Starts watching the connection and sending the queue. Returns the cleanup. */
export function startOfflineSets(queryClient: QueryClient): () => void {
  client = queryClient;
  void load().then(() => void syncNow());
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    const next = state.isConnected !== false;
    if (next === online) return;
    online = next;
    emit();
    if (online) {
      retryAttempt = 0;
      void syncNow();
    }
  });
  const appState = AppState.addEventListener("change", (s) => {
    if (s === "active") void syncNow();
  });
  return () => {
    unsubscribeNet();
    appState.remove();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    client = null;
  };
}

export function setOfflineSetsUser(id: string | null) {
  if (id === userId) return;
  userId = id;
  emit();
  if (id) void syncNow();
}

/** How refused sets are reported (a toast, from OfflineSetSync). */
export function setRejectedNotifier(fn: ((rejected: RejectedSet[]) => void) | null) {
  notifyRejected = fn;
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncNow();
  }, delay);
}

/** Sends this member's queue now (one run at a time). Resolves when it stops; null when there was nothing to do. */
export function syncNow(): Promise<DrainResult | null> {
  if (draining) return draining;
  const uid = userId;
  if (!loaded || !uid || !online || !queue.items.some((i) => i.userId === uid)) return Promise.resolve(null);
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  syncing = true;
  emit();
  let again = false;
  draining = drainQueue({
    userId: uid,
    read: () => queue,
    write,
    api: {
      fetchSession: fetchWorkoutSession,
      postSet: (sessionId, input) => logWorkoutSet(sessionId, input, { timeout: LIVE_TIMEOUT_MS }),
      patchSet: (sessionId, setId, change) => updateWorkoutSet(sessionId, setId, change, { timeout: LIVE_TIMEOUT_MS }),
      deleteSet: (sessionId, setId) => deleteWorkoutSet(sessionId, setId, { timeout: LIVE_TIMEOUT_MS }),
      patchProgress: (sessionId, index) => updateSessionProgress(sessionId, index, { timeout: LIVE_TIMEOUT_MS }),
    },
    // Into the shared session data first, so the set never disappears between the queue and the refetch.
    onSetSaved: (sessionId, row, localId) => {
      syncedIds.set(localId, row.id);
      client?.setQueryData<WorkoutSession>(["workoutSession", sessionId], (s) => withSetLog(s, row));
    },
    now: () => new Date(),
  })
    .then((result) => {
      for (const id of result.sessions) {
        void client?.invalidateQueries({ queryKey: ["workoutSession", id] });
        void client?.invalidateQueries({ queryKey: ["workoutSessions", id, "summary"] });
      }
      if (result.sessions.length > 0) void client?.invalidateQueries({ queryKey: ["workoutHistory"] });
      if (result.rejected.length > 0) notifyRejected?.(result.rejected);
      if (result.stopped === "retry") scheduleRetry();
      else if (result.stopped === null) {
        retryAttempt = 0;
        again = true; // something queued just as the run ended is sent straight away
      }
      return result;
    })
    .catch(() => {
      scheduleRetry();
      return null;
    })
    .finally(() => {
      draining = null;
      syncing = false;
      emit();
      if (again) void syncNow();
    });
  return draining;
}

function kick(afterNoAnswer: boolean) {
  // After a request that got no answer while NetInfo still says online, wait before trying again.
  if (afterNoAnswer) scheduleRetry();
  else void syncNow();
}

/** Logs a set: to the server when that works now, else onto this phone's queue (shown as waiting to sync). */
export async function saveSet(sessionId: string, input: LogSetInput): Promise<{ row: ExerciseSetLog; queued: boolean }> {
  await load();
  const uid = userId;
  if (!uid) return { row: (await logWorkoutSet(sessionId, input)) as ExerciseSetLog, queued: false };
  let noAnswer = false;
  if (online && !hasQueuedWork(queue, uid, sessionId)) {
    try {
      return { row: (await logWorkoutSet(sessionId, input, { timeout: LIVE_TIMEOUT_MS })) as ExerciseSetLog, queued: false };
    } catch (err) {
      if (!isNoResponse(err)) throw err;
      noAnswer = true;
    }
  }
  const now = new Date();
  const item: QueuedSet = { ...base(uid, sessionId), kind: "set", localId: newLocalSetId(now.getTime(), Math.random()), input, loggedAt: now.toISOString() };
  write(enqueueSet(queue, item));
  kick(noAnswer);
  return { row: pendingRow(item), queued: true };
}

/** Saves which exercise the member is on; queued like a set when it can't be sent now. */
export async function saveProgress(sessionId: string, currentExerciseIndex: number): Promise<"saved" | "queued"> {
  await load();
  const uid = userId;
  if (!uid) {
    await updateSessionProgress(sessionId, currentExerciseIndex);
    return "saved";
  }
  let noAnswer = false;
  if (online && !hasQueuedWork(queue, uid, sessionId)) {
    try {
      await updateSessionProgress(sessionId, currentExerciseIndex, { timeout: LIVE_TIMEOUT_MS });
      return "saved";
    } catch (err) {
      if (!isNoResponse(err)) throw err;
      noAnswer = true;
    }
  }
  write(queueProgress(queue, base(uid, sessionId), currentExerciseIndex));
  kick(noAnswer);
  return "queued";
}

/** The server id for a set row's id: a waiting set that has since synced is edited through its new id. */
function resolveSetId(setId: string): string | null {
  if (!isLocalSetId(setId)) return setId;
  return syncedIds.get(setId) ?? null;
}

/** Edits a set. A waiting set's queued item is changed; a synced set is edited now, or queued without a connection. */
export async function editSet(sessionId: string, setId: string, change: UpdateSetInput): Promise<"saved" | "queued"> {
  await load();
  if (isLocalSetId(setId) && hasQueuedSet(queue, setId)) {
    write(editQueuedSet(queue, setId, change));
    return "queued";
  }
  const id = resolveSetId(setId);
  if (!id) throw new Error("That set is no longer on this phone. Close this and try again.");
  const uid = userId;
  if (!uid) {
    await updateWorkoutSet(sessionId, id, change);
    return "saved";
  }
  let noAnswer = false;
  if (online && !hasQueuedWork(queue, uid, sessionId)) {
    try {
      await updateWorkoutSet(sessionId, id, change, { timeout: LIVE_TIMEOUT_MS });
      return "saved";
    } catch (err) {
      if (!isNoResponse(err)) throw err;
      noAnswer = true;
    }
  }
  write(queueEdit(queue, base(uid, sessionId), id, change));
  kick(noAnswer);
  return "queued";
}

/** Deletes a set. A waiting set is simply dropped from the queue (done: "saved"); a synced set is deleted now, or queued. */
export async function removeSet(sessionId: string, setId: string): Promise<"saved" | "queued"> {
  await load();
  if (isLocalSetId(setId) && hasQueuedSet(queue, setId)) {
    write(removeQueuedSet(queue, setId));
    return "saved";
  }
  const id = resolveSetId(setId);
  if (!id) throw new Error("That set is no longer on this phone. Close this and try again.");
  const uid = userId;
  if (!uid) {
    await deleteWorkoutSet(sessionId, id);
    return "saved";
  }
  let noAnswer = false;
  if (online && !hasQueuedWork(queue, uid, sessionId)) {
    try {
      await deleteWorkoutSet(sessionId, id, { timeout: LIVE_TIMEOUT_MS });
      return "saved";
    } catch (err) {
      if (!isNoResponse(err)) throw err;
      noAnswer = true;
    }
  }
  write(queueDelete(queue, base(uid, sessionId), id));
  kick(noAnswer);
  return "queued";
}

/** Tries to send everything now; resolves with the sets still waiting for this workout. */
export async function flushOfflineSets(sessionId: string): Promise<number> {
  await load();
  await syncNow();
  return waitingFor(sessionId);
}

/** Sets waiting to sync for this workout, read now (for a decision inside a handler). */
export function waitingFor(sessionId: string): number {
  return userId ? waitingSetCount(queue, userId, sessionId) : 0;
}

export function isOnline(): boolean {
  return online;
}

export function dismissRejected(sessionId?: string) {
  if (userId) write(clearRejected(queue, userId, sessionId));
}

export interface OfflineSetsState {
  online: boolean;
  syncing: boolean;
  /** Sets waiting to sync (new, edited or deleted). */
  waiting: number;
  rejected: RejectedSet[];
  items: QueueItem[];
}

/** This member's queue, for one workout or (no id) all of them. Re-renders on every change. */
export function useOfflineSets(sessionId?: string): OfflineSetsState {
  const version = useSyncExternalStore(subscribe, () => stamp, () => stamp);
  useEffect(() => {
    void load();
  }, []);
  return useMemo(() => {
    const uid = userId;
    return {
      online,
      syncing,
      waiting: uid ? waitingSetCount(queue, uid, sessionId) : 0,
      rejected: uid ? rejectedFor(queue, uid, sessionId) : [],
      items: uid ? itemsFor(queue, uid, sessionId) : [],
    };
    // `version` changes on every store change; the module values are read through it.
  }, [version, sessionId]);
}

/** The cached session with this phone's waiting sets, edits and exercise index laid over it. */
export function useQueuedSession(session: WorkoutSession | undefined, offline: OfflineSetsState): WorkoutSession | undefined {
  return useMemo(() => withQueuedChanges(session, offline.items), [session, offline.items]);
}
