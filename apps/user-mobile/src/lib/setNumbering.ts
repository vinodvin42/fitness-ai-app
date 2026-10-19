/**
 * Set numbering for a workout session (Oct 2026). Active Workout and the Set/Rest Tracker both read one exercise's
 * recorded sets from the shared session query (["workoutSession", sessionId]) and number the next set from it, so a
 * set logged or deleted on either screen is seen by the other.
 *
 * Numbers are one more than the highest recorded, never the count: after a deleted set (1, 3) the next is 4, not 3.
 * This removes the screen-to-screen numbering mismatch only. It does NOT prevent duplicate rows from two requests
 * for the same set (a retry after a lost response, a double tap, two devices); the server has no idempotency key yet.
 */

/** One exercise's recorded sets, in set-number order. */
export function setLogsFor<T extends { exerciseId: string; setNumber: number }>(logs: readonly T[], exerciseId: string): T[] {
  return logs.filter((l) => l.exerciseId === exerciseId).sort((a, b) => a.setNumber - b.setNumber);
}

/** The number for this exercise's next set: one more than the highest recorded (1 when none). */
export function nextSetNumber(logs: ReadonlyArray<{ setNumber: number }>): number {
  return logs.reduce((max, l) => Math.max(max, l.setNumber), 0) + 1;
}

/**
 * The cached session with a set the server just created added, so both screens number from it immediately, even
 * if the follow-up refetch fails. Returns the session unchanged when the response is not a set row or is already in it.
 */
export function withSetLog<L extends { id: string; exerciseId: string; setNumber: number }, S extends { setLogs: L[] }>(
  session: S | undefined,
  created: unknown,
): S | undefined {
  if (!session || !isSetRow(created) || session.setLogs.some((l) => l.id === created.id)) return session;
  return { ...session, setLogs: [...session.setLogs, created as L] };
}

function isSetRow(x: unknown): x is { id: string; exerciseId: string; setNumber: number } {
  const r = x as { id?: unknown; exerciseId?: unknown; setNumber?: unknown } | null;
  return !!r && typeof r.id === "string" && typeof r.exerciseId === "string" && typeof r.setNumber === "number";
}
