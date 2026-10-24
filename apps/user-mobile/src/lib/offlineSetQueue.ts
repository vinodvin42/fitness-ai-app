import type { ExerciseSetLog, LogSetInput, UpdateSetInput } from "@fitness-ai-app/types";

/**
 * Offline set logging (Figma today/08 "Offline with cached workout", 24 Oct 2026): the pure part, no React Native,
 * so tests/offlineSetQueue.check.cjs runs it in Node. lib/offlineSets.ts keeps the queue in AsyncStorage and runs it.
 *
 * - A set logged without a connection is queued with a local id ("local-…") and the set number it was given, and
 *   shown as "waiting to sync" by laying the queue over the cached session (withQueuedChanges). The queue, not the
 *   query cache, holds it, so a refetch on reconnect can't drop it.
 * - Editing or deleting a waiting set changes or removes its queued item. A set that has synced and is edited or
 *   deleted offline gets its own queued edit or delete.
 * - On reconnect the queue is sent in order (drainQueue). Set numbers are sent as given, so they don't move, and
 *   the server id replaces the local one.
 * - The API has no idempotency key, so a set whose response was lost may already be on the server. Before sending,
 *   the session is read once; a server row with the same exercise, set number and values that no earlier item
 *   claimed is taken as that set instead of posting it again. Set numbers are one more than the highest recorded, so
 *   only that lost save (or the same set logged from another device) can have the number.
 * - The server sets loggedAt when the set arrives, so a synced set carries the sync time, not the time it was done.
 */

export const LOCAL_SET_PREFIX = "local-";
/** Queued items older than this are dropped when the queue is read: that workout is long over. */
export const QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Kept so the screen can say which sets were refused; older ones are dropped. */
const MAX_REJECTED = 20;

interface QueuedBase {
  userId: string;
  sessionId: string;
  queuedAt: string;
}
export interface QueuedSet extends QueuedBase {
  kind: "set";
  localId: string;
  input: LogSetInput;
  loggedAt: string;
}
/** A change to a set the server already has. */
export interface QueuedEdit extends QueuedBase {
  kind: "edit";
  setId: string;
  change: UpdateSetInput;
}
export interface QueuedDelete extends QueuedBase {
  kind: "delete";
  setId: string;
}
/** Which exercise the member is on (PATCH …/progress); only the latest is kept. */
export interface QueuedProgress extends QueuedBase {
  kind: "progress";
  currentExerciseIndex: number;
}
export type QueueItem = QueuedSet | QueuedEdit | QueuedDelete | QueuedProgress;

/** A queued set the server refused (the workout was closed, or the session is gone). */
export interface RejectedSet {
  userId: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  reason: "closed" | "not_found" | "invalid";
  at: string;
}

export interface OfflineQueue {
  items: QueueItem[];
  rejected: RejectedSet[];
}
export const EMPTY_QUEUE: OfflineQueue = { items: [], rejected: [] };

/** A set row as the screens read it; `pending` marks one waiting to sync. */
export type QueuedSetRow = ExerciseSetLog & { pending?: boolean };

export function isLocalSetId(id: string): boolean {
  return id.startsWith(LOCAL_SET_PREFIX);
}

export function newLocalSetId(nowMs: number, random: number): string {
  return `${LOCAL_SET_PREFIX}${nowMs.toString(36)}-${Math.floor(random * 36 ** 6)
    .toString(36)
    .padStart(6, "0")}`;
}

export function isPendingRow(row: unknown): boolean {
  return (row as QueuedSetRow | null)?.pending === true;
}

// ---- reading and changing the queue

/** The stored queue, or an empty one when it is missing, corrupt or from another shape; expired items are dropped. */
export function parseQueue(raw: string | null, now: Date): OfflineQueue {
  if (!raw) return EMPTY_QUEUE;
  try {
    const parsed = JSON.parse(raw) as Partial<OfflineQueue> | null;
    const cutoff = now.getTime() - QUEUE_MAX_AGE_MS;
    const fresh = (at: unknown) => typeof at === "string" && Date.parse(at) >= cutoff;
    const items = Array.isArray(parsed?.items) ? parsed.items.filter((i) => isQueueItem(i) && fresh(i.queuedAt)) : [];
    const rejected = Array.isArray(parsed?.rejected) ? parsed.rejected.filter((r) => !!r && typeof r.sessionId === "string" && fresh(r.at)) : [];
    return { items, rejected };
  } catch {
    return EMPTY_QUEUE;
  }
}

function isQueueItem(x: unknown): x is QueueItem {
  const i = x as Partial<QueueItem> | null;
  if (!i || typeof i.userId !== "string" || typeof i.sessionId !== "string" || typeof i.queuedAt !== "string") return false;
  if (i.kind === "set") return typeof i.localId === "string" && !!i.input && typeof i.input.exerciseId === "string" && typeof i.input.setNumber === "number";
  if (i.kind === "edit") return typeof i.setId === "string" && !!i.change;
  if (i.kind === "delete") return typeof i.setId === "string";
  if (i.kind === "progress") return typeof i.currentExerciseIndex === "number";
  return false;
}

export function enqueueSet(q: OfflineQueue, item: QueuedSet): OfflineQueue {
  if (q.items.some((i) => i.kind === "set" && i.localId === item.localId)) return q;
  return { ...q, items: [...q.items, item] };
}

/** Changes a waiting set in place. It hasn't been sent, so the change simply goes with it. */
export function editQueuedSet(q: OfflineQueue, localId: string, change: UpdateSetInput): OfflineQueue {
  let found = false;
  const items = q.items.map((i) => {
    if (i.kind !== "set" || i.localId !== localId) return i;
    found = true;
    return { ...i, input: applyToInput(i.input, change) };
  });
  return found ? { ...q, items } : q;
}

/** Removes a waiting set: it never reaches the server. */
export function removeQueuedSet(q: OfflineQueue, localId: string): OfflineQueue {
  const items = q.items.filter((i) => !(i.kind === "set" && i.localId === localId));
  return items.length === q.items.length ? q : { ...q, items };
}

export function hasQueuedSet(q: OfflineQueue, localId: string): boolean {
  return q.items.some((i) => i.kind === "set" && i.localId === localId);
}

/** A change to a synced set; merged into an edit already queued for it, ignored when it is queued for deletion. */
export function queueEdit(q: OfflineQueue, base: QueuedBase, setId: string, change: UpdateSetInput): OfflineQueue {
  if (q.items.some((i) => i.kind === "delete" && i.setId === setId)) return q;
  const index = q.items.findIndex((i) => i.kind === "edit" && i.setId === setId);
  if (index === -1) return { ...q, items: [...q.items, { ...base, kind: "edit", setId, change }] };
  const items = q.items.slice();
  const existing = items[index] as QueuedEdit;
  items[index] = { ...existing, change: { ...existing.change, ...change } };
  return { ...q, items };
}

/** Deletes a synced set; any edit queued for it is dropped. */
export function queueDelete(q: OfflineQueue, base: QueuedBase, setId: string): OfflineQueue {
  const items = q.items.filter((i) => !(i.kind === "edit" && i.setId === setId));
  if (items.some((i) => i.kind === "delete" && i.setId === setId)) return { ...q, items };
  return { ...q, items: [...items, { ...base, kind: "delete", setId }] };
}

/** The exercise the member is on; replaces an earlier one for the same session. */
export function queueProgress(q: OfflineQueue, base: QueuedBase, currentExerciseIndex: number): OfflineQueue {
  const items = q.items.filter((i) => !(i.kind === "progress" && i.userId === base.userId && i.sessionId === base.sessionId));
  return { ...q, items: [...items, { ...base, kind: "progress", currentExerciseIndex }] };
}

export function itemsFor(q: OfflineQueue, userId: string, sessionId?: string): QueueItem[] {
  return q.items.filter((i) => i.userId === userId && (sessionId == null || i.sessionId === sessionId));
}

/** Sets waiting to sync (new, edited or deleted), the count the screens show. Progress isn't counted. */
export function waitingSetCount(q: OfflineQueue, userId: string, sessionId?: string): number {
  return itemsFor(q, userId, sessionId).filter((i) => i.kind !== "progress").length;
}

export function hasQueuedWork(q: OfflineQueue, userId: string, sessionId: string): boolean {
  return q.items.some((i) => i.userId === userId && i.sessionId === sessionId);
}

export function rejectedFor(q: OfflineQueue, userId: string, sessionId?: string): RejectedSet[] {
  return q.rejected.filter((r) => r.userId === userId && (sessionId == null || r.sessionId === sessionId));
}

export function clearRejected(q: OfflineQueue, userId: string, sessionId?: string): OfflineQueue {
  const rejected = q.rejected.filter((r) => !(r.userId === userId && (sessionId == null || r.sessionId === sessionId)));
  return rejected.length === q.rejected.length ? q : { ...q, rejected };
}

// ---- the queue laid over the cached session

function applyToInput(input: LogSetInput, change: UpdateSetInput): LogSetInput {
  const next: LogSetInput = { ...input };
  if (change.reps !== undefined) next.reps = change.reps;
  if (change.weightKg !== undefined) {
    if (change.weightKg === null) delete next.weightKg;
    else next.weightKg = change.weightKg;
  }
  if (change.rpe !== undefined) {
    if (change.rpe === null) delete next.rpe;
    else next.rpe = change.rpe;
  }
  if (change.note !== undefined) {
    if (!change.note) delete next.note;
    else next.note = change.note;
  }
  for (const k of ["isWarmup", "isDropSet", "isFailure"] as const) {
    if (change[k] === undefined) continue;
    if (change[k]) next[k] = true;
    else delete next[k];
  }
  return next;
}

function applyToRow(row: ExerciseSetLog, change: UpdateSetInput): ExerciseSetLog {
  return {
    ...row,
    ...(change.reps !== undefined ? { reps: change.reps } : {}),
    ...(change.weightKg !== undefined ? { weightKg: change.weightKg } : {}),
    ...(change.rpe !== undefined ? { rpe: change.rpe } : {}),
    ...(change.note !== undefined ? { note: change.note || null } : {}),
    ...(change.isWarmup !== undefined ? { isWarmup: change.isWarmup } : {}),
    ...(change.isDropSet !== undefined ? { isDropSet: change.isDropSet } : {}),
    ...(change.isFailure !== undefined ? { isFailure: change.isFailure } : {}),
  };
}

/** A waiting set as a set row, so both screens number from it and show it. */
export function pendingRow(item: QueuedSet): QueuedSetRow {
  const i = item.input;
  return {
    id: item.localId,
    exerciseId: i.exerciseId,
    setNumber: i.setNumber,
    weightKg: i.weightKg ?? null,
    reps: i.reps,
    rpe: i.rpe ?? null,
    isWarmup: !!i.isWarmup,
    isDropSet: !!i.isDropSet,
    isFailure: !!i.isFailure,
    note: i.note ?? null,
    loggedAt: item.loggedAt,
    pending: true,
  };
}

/**
 * The cached session with this session's queued changes laid over it: deleted sets hidden, edits applied (marked
 * pending), waiting sets added (pending), and the queued exercise index. Unchanged when nothing is queued for it.
 */
export function withQueuedChanges<S extends { id: string; setLogs: ExerciseSetLog[]; currentExerciseIndex: number }>(
  session: S | undefined,
  items: readonly QueueItem[],
): S | undefined {
  if (!session) return session;
  const mine = items.filter((i) => i.sessionId === session.id);
  if (mine.length === 0) return session;
  const deleted = new Set<string>();
  const edits = new Map<string, UpdateSetInput>();
  let progress: number | null = null;
  for (const i of mine) {
    if (i.kind === "delete") deleted.add(i.setId);
    else if (i.kind === "edit") edits.set(i.setId, { ...(edits.get(i.setId) ?? {}), ...i.change });
    else if (i.kind === "progress") progress = i.currentExerciseIndex;
  }
  const known = new Set(session.setLogs.map((l) => l.id));
  const setLogs: QueuedSetRow[] = session.setLogs
    .filter((l) => !deleted.has(l.id))
    .map((l) => {
      const change = edits.get(l.id);
      return change ? { ...applyToRow(l, change), pending: true } : l;
    });
  for (const i of mine) if (i.kind === "set" && !known.has(i.localId)) setLogs.push(pendingRow(i));
  return { ...session, setLogs, currentExerciseIndex: progress ?? session.currentExerciseIndex };
}

// ---- sending the queue

/** The same set: exercise, number, reps, weight, RPE and type (the note is trimmed by the server, so not compared). */
export function sameSet(input: LogSetInput, row: ExerciseSetLog): boolean {
  return (
    row.exerciseId === input.exerciseId &&
    row.setNumber === input.setNumber &&
    row.reps === input.reps &&
    (row.weightKg ?? null) === (input.weightKg ?? null) &&
    (row.rpe ?? null) === (input.rpe ?? null) &&
    !!row.isWarmup === !!input.isWarmup &&
    !!row.isDropSet === !!input.isDropSet &&
    !!row.isFailure === !!input.isFailure
  );
}

function sameInput(a: LogSetInput, b: LogSetInput): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}
function normalise(i: LogSetInput) {
  return [i.exerciseId, i.setNumber, i.reps, i.weightKg ?? null, i.rpe ?? null, !!i.isWarmup, !!i.isDropSet, !!i.isFailure, i.note ?? null];
}

/** What changed between the input that was sent and the one the member has since edited it to. */
function inputChange(sent: LogSetInput, now: LogSetInput): UpdateSetInput {
  const change: UpdateSetInput = {};
  if (sent.reps !== now.reps) change.reps = now.reps;
  if ((sent.weightKg ?? null) !== (now.weightKg ?? null)) change.weightKg = now.weightKg ?? null;
  if ((sent.rpe ?? null) !== (now.rpe ?? null)) change.rpe = now.rpe ?? null;
  if ((sent.note ?? null) !== (now.note ?? null)) change.note = now.note ?? null;
  for (const k of ["isWarmup", "isDropSet", "isFailure"] as const) if (!!sent[k] !== !!now[k]) change[k] = !!now[k];
  return change;
}

/**
 * After a waiting set reached the server: drop it from the queue. If the member edited or deleted it while it was
 * being sent, that becomes a queued edit or delete of the new server row, in the same place in the queue.
 */
export function settleSentSet(q: OfflineQueue, sent: QueuedSet, serverId: string): OfflineQueue {
  const index = q.items.findIndex((i) => i.kind === "set" && i.localId === sent.localId);
  const base = { userId: sent.userId, sessionId: sent.sessionId, queuedAt: sent.queuedAt };
  if (index === -1) return { ...q, items: [...q.items, { ...base, kind: "delete", setId: serverId }] };
  const current = q.items[index] as QueuedSet;
  const items = q.items.slice();
  if (sameInput(current.input, sent.input)) items.splice(index, 1);
  else items[index] = { ...base, kind: "edit", setId: serverId, change: inputChange(sent.input, current.input) };
  return { ...q, items };
}

/** What a failed request means for the queue. No response at all (offline, timeout, DNS): try again later. */
export function classifyFailure(err: unknown): { kind: "retry" } | { kind: "stop" } | { kind: "reject"; reason: RejectedSet["reason"] } {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  if (status == null) return { kind: "retry" };
  if (status === 401 || status === 403) return { kind: "stop" }; // signed out or not allowed: keep everything
  if (status === 409) return { kind: "reject", reason: "closed" }; // session_not_active
  if (status === 404) return { kind: "reject", reason: "not_found" };
  if (status === 400 || status === 422) return { kind: "reject", reason: "invalid" };
  return { kind: "retry" }; // 5xx, 429
}

/** True when the request never got an answer, so the set may be queued instead of reported as an error. */
export function isNoResponse(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status == null;
}

export interface DrainApi {
  fetchSession(sessionId: string): Promise<{ setLogs: ExerciseSetLog[] }>;
  postSet(sessionId: string, input: LogSetInput): Promise<unknown>;
  patchSet(sessionId: string, setId: string, change: UpdateSetInput): Promise<unknown>;
  deleteSet(sessionId: string, setId: string): Promise<unknown>;
  patchProgress(sessionId: string, currentExerciseIndex: number): Promise<unknown>;
}

export interface DrainIo {
  userId: string;
  /** The live queue: it can change while a request is out (a new set, an edit). */
  read(): OfflineQueue;
  write(next: OfflineQueue): void;
  api: DrainApi;
  /** A waiting set is now a server row: called before the queue drops it, so the screen never shows neither. */
  onSetSaved?(sessionId: string, row: ExerciseSetLog, localId: string): void;
  now(): Date;
}

export interface DrainResult {
  sent: number;
  rejected: RejectedSet[];
  /** Why it stopped early with items left: "retry" (no connection or a server error) or "stop" (auth). */
  stopped: null | "retry" | "stop";
  sessions: string[];
}

function isSetRow(x: unknown): x is ExerciseSetLog {
  const r = x as Partial<ExerciseSetLog> | null;
  return !!r && typeof r.id === "string" && typeof r.exerciseId === "string" && typeof r.setNumber === "number";
}

/**
 * Sends this user's queued items one at a time, oldest first, always taking the head of the live queue. Stops at the
 * first failure that may succeed later, so order is kept; an item the server refuses is dropped (sets are recorded in
 * `rejected`) and the rest carry on.
 */
export async function drainQueue(io: DrainIo, maxSteps = 500): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, rejected: [], stopped: null, sessions: [] };
  const serverRows = new Map<string, ExerciseSetLog[]>();
  const claimed = new Set<string>();
  for (let step = 0; step < maxSteps; step++) {
    const head = io.read().items.find((i) => i.userId === io.userId);
    if (!head) break;
    if (!result.sessions.includes(head.sessionId)) result.sessions.push(head.sessionId);
    try {
      if (head.kind === "set") {
        let rows = serverRows.get(head.sessionId);
        if (!rows) {
          rows = (await io.api.fetchSession(head.sessionId)).setLogs;
          serverRows.set(head.sessionId, rows);
        }
        const already = rows.find((r) => !claimed.has(r.id) && sameSet(head.input, r));
        const created = already ?? (await io.api.postSet(head.sessionId, head.input));
        if (!isSetRow(created)) throw new Error("The server's reply was not a set");
        claimed.add(created.id);
        io.onSetSaved?.(head.sessionId, created, head.localId);
        io.write(settleSentSet(io.read(), head, created.id));
      } else {
        if (head.kind === "edit") await io.api.patchSet(head.sessionId, head.setId, head.change);
        else if (head.kind === "delete") {
          await io.api.deleteSet(head.sessionId, head.setId).catch((err: unknown) => {
            if ((err as { response?: { status?: number } } | null)?.response?.status !== 404) throw err; // already gone
          });
          claimed.add(head.setId);
        } else await io.api.patchProgress(head.sessionId, head.currentExerciseIndex);
        io.write(withoutItem(io.read(), head));
      }
      result.sent += 1;
    } catch (err) {
      const failure = classifyFailure(err);
      if (failure.kind !== "reject") {
        result.stopped = failure.kind;
        break;
      }
      // The server refused this item for good. A refused set is recorded so the member is told; a refused edit,
      // delete or exercise index is simply dropped.
      const q = withoutItem(io.read(), head);
      if (head.kind === "set") {
        const record: RejectedSet = {
          userId: head.userId,
          sessionId: head.sessionId,
          exerciseId: head.input.exerciseId,
          setNumber: head.input.setNumber,
          reason: failure.reason,
          at: io.now().toISOString(),
        };
        result.rejected.push(record);
        io.write({ ...q, rejected: [...q.rejected, record].slice(-MAX_REJECTED) });
      } else io.write(q);
    }
  }
  return result;
}

function withoutItem(q: OfflineQueue, item: QueueItem): OfflineQueue {
  const items = q.items.filter((i) =>
    item.kind === "set" ? !(i.kind === "set" && i.localId === item.localId) : i !== item && !sameNonSet(i, item),
  );
  return { ...q, items };
}

/** Edits are merged and progress replaced while a request is out, so they are matched by what they point at. */
function sameNonSet(a: QueueItem, b: QueueItem): boolean {
  if (a.kind !== b.kind || a.userId !== b.userId || a.sessionId !== b.sessionId) return false;
  if (a.kind === "edit" && b.kind === "edit") return a.setId === b.setId && JSON.stringify(a.change) === JSON.stringify(b.change);
  if (a.kind === "delete" && b.kind === "delete") return a.setId === b.setId;
  if (a.kind === "progress" && b.kind === "progress") return a.currentExerciseIndex === b.currentExerciseIndex;
  return false;
}
